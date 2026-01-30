import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import * as IDX from 'idxs'
import { Address, Hex } from 'ox'
import * as z from 'zod/mini'

import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const MAX_LIMIT = 1_000
const QUERY_TIMEOUT_MS = 8_000

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

const RequestParametersSchema = z.object({
	offset: z.prefault(z.coerce.number(), 0),
	limit: z.prefault(z.coerce.number(), 10),
})

type EventData = {
	txHash: Hex.Hex
	blockNumber: Hex.Hex
	blockTimestamp: number | null
	logIndex: number
	contractAddress: Address.Address
	topics: Hex.Hex[]
	data: Hex.Hex
}

type EventsApiResponse = {
	events: EventData[]
	total: number
	offset: number
	limit: number
	hasMore: boolean
	error: null | string
}

export const Route = createFileRoute('/api/address/events/$address')({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				try {
					const url = new URL(request.url, __BASE_URL__ || 'http://localhost')
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const parseParams = RequestParametersSchema.safeParse(
						Object.fromEntries(url.searchParams),
					)
					if (!parseParams.success)
						return json(
							{ error: z.prettifyError(parseParams.error) },
							{ status: 400 },
						)

					const { offset, limit: rawLimit } = parseParams.data

					if (rawLimit > MAX_LIMIT)
						return json({ error: 'Limit is too high' }, { status: 400 })
					const limit = Math.max(1, rawLimit)

					const chainId = getWagmiConfig().getClient().chain.id

					const result = await withTimeout(
						QB.selectFrom('logs')
							.select([
								'tx_hash',
								'block_num',
								'log_idx',
								'address',
								'topics',
								'data',
							])
							.where('chain', '=', chainId)
							.where('address', '=', address)
							.orderBy('block_num', 'desc')
							.orderBy('log_idx', 'desc')
							.offset(offset)
							.limit(limit + 1)
							.execute(),
						QUERY_TIMEOUT_MS,
					)

					const hasMore = result.length > limit
					const logs = hasMore ? result.slice(0, limit) : result

					const events: EventData[] = logs.map((log) => ({
						txHash: log.tx_hash,
						blockNumber: Hex.fromNumber(log.block_num),
						blockTimestamp: null,
						logIndex: log.log_idx,
						contractAddress: Address.checksum(log.address),
						topics: log.topics,
						data: log.data,
					}))

					return json({
						events,
						total: events.length,
						offset: offset + events.length,
						limit,
						hasMore,
						error: null,
					} satisfies EventsApiResponse)
				} catch (error) {
					console.error(error)
					if (error instanceof QueryTimeoutError) {
						return json(
							{ events: [], total: 0, offset: 0, limit: 10, hasMore: false, error: 'Query timed out. This contract may have too many events.' },
							{ status: 504 },
						)
					}
					const errorMessage = error instanceof Error ? error.message : error
					return json(
						{ events: [], total: 0, offset: 0, limit: 10, hasMore: false, error: errorMessage },
						{ status: 500 },
					)
				}
			},
		},
	},
})
