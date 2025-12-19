import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import * as IDX from 'idxs'
import { Address } from 'ox'

import { zAddress } from '#lib/zod.ts'
import { config } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const QUERY_TIMEOUT_MS = 8_000

// ,void timeout on addresses with many events
const MAX_COUNT = 1000

class QueryTimeoutError extends Error {
	constructor(ms: number) {
		super(`Query timed out after ${ms}ms`)
		this.name = 'QueryTimeoutError'
	}
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new QueryTimeoutError(ms)), ms),
		),
	])
}

export const Route = createFileRoute('/api/address/events-count/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const chainId = config.getClient().chain.id

					const result = await withTimeout(
						QB.selectFrom('logs')
							.select(['log_idx'])
							.where('chain', '=', chainId)
							.where('address', '=', address)
							.limit(MAX_COUNT + 1)
							.execute(),
						QUERY_TIMEOUT_MS,
					)

					const count = result.length
					const isExact = count <= MAX_COUNT

					return json({
						data: isExact ? count : null,
						isExact,
						error: null,
					})
				} catch (error) {
					console.error(error)
					if (error instanceof QueryTimeoutError) {
						return json({
							data: null,
							isExact: false,
							error: null,
						})
					}
					const errorMessage = error instanceof Error ? error.message : error
					return json(
						{ data: null, isExact: false, error: errorMessage },
						{ status: 500 },
					)
				}
			},
		},
	},
})
