import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import * as IDX from 'idxs'
import { Address } from 'ox'
import * as z from 'zod/mini'

import { zAddress } from '#lib/zod.ts'
import { config } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const chainId = config.getClient().chain.id

const RequestSchema = z.object({
	chainId: z.prefault(z.coerce.number(), chainId),
})

// Timeout for IndexSupply queries (10 seconds)
const QUERY_TIMEOUT_MS = 10_000

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

export const Route = createFileRoute('/api/address/txs-count/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const parseResult = RequestSchema.safeParse(params)
					if (!parseResult.success)
						return json(
							{ error: z.prettifyError(parseResult.error), data: null },
							{ status: 400 },
						)

					const { chainId } = parseResult.data

					const [txSentResult, txReceivedResult] = await withTimeout(
						Promise.all([
							QB.selectFrom('txs')
								.select((eb) => eb.fn.count('hash').as('cnt'))
								.where('from', '=', address)
								.where('chain', '=', chainId)
								.executeTakeFirst(),
							QB.selectFrom('txs')
								.select((eb) => eb.fn.count('hash').as('cnt'))
								.where('to', '=', address)
								.where('chain', '=', chainId)
								.executeTakeFirst(),
						]),
						QUERY_TIMEOUT_MS,
					)

					const txSent = txSentResult?.cnt ?? 0
					const txReceived = txReceivedResult?.cnt ?? 0

					return json({
						data: Number(txSent) + Number(txReceived),
						error: null,
					})
				} catch (error) {
					console.error(error)
					const errorMessage = error instanceof Error ? error.message : error
					return json({ data: null, error: errorMessage }, { status: 500 })
				}
			},
		},
	},
})
