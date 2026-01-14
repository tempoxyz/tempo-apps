import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { Address } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import type { TokenTransfer } from '../../_types'
import {
	badRequest,
	corsPreflightResponse,
	DEFAULT_LIMIT,
	MAX_LIMIT,
	paginatedResponse,
	serverError,
} from '../../_utils'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

const QuerySchema = z.object({
	offset: z.prefault(z.coerce.number(), 0),
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
	account: z.optional(zAddress({ lowercase: true })),
})

export const Route = createFileRoute('/v1/tokens/transfers/$address')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async ({ params, request }) => {
				try {
					const parseResult = zAddress({ lowercase: true }).safeParse(
						params.address,
					)
					if (!parseResult.success) {
						return badRequest('Invalid address format')
					}
					const address = parseResult.data

					const url = new URL(request.url)
					const queryResult = QuerySchema.safeParse(
						Object.fromEntries(url.searchParams),
					)
					if (!queryResult.success) {
						return badRequest('Invalid query parameters', queryResult.error)
					}

					const query = queryResult.data
					const limit = Math.min(Math.max(query.limit, 1), MAX_LIMIT)
					const offset = Math.max(query.offset, 0)

					const config = getWagmiConfig()
					const chainId = getChainId(config)

					let transfersQuery = QB.withSignatures([TRANSFER_SIGNATURE])
						.selectFrom('transfer')
						.select([
							'from',
							'to',
							'tokens',
							'tx_hash',
							'block_num',
							'log_idx',
							'block_timestamp',
						])
						.where('chain', '=', chainId)
						.where('address', '=', address)

					if (query.account) {
						transfersQuery = transfersQuery.where((eb) =>
							eb.or([
								eb('from', '=', query.account as string),
								eb('to', '=', query.account as string),
							]),
						)
					}

					let countQuery = QB.withSignatures([TRANSFER_SIGNATURE])
						.selectFrom('transfer')
						.select((eb) => eb.lit(1).as('x'))
						.where('chain', '=', chainId)
						.where('address', '=', address)

					if (query.account) {
						countQuery = countQuery.where((eb) =>
							eb.or([
								eb('from', '=', query.account as string),
								eb('to', '=', query.account as string),
							]),
						)
					}

					const [transfersResult, countResult] = await Promise.all([
						transfersQuery
							.orderBy('block_num', 'desc')
							.orderBy('log_idx', 'desc')
							.limit(limit)
							.offset(offset)
							.execute(),
						QB.selectFrom(countQuery.limit(TOKEN_COUNT_MAX).as('subquery'))
							.select((eb) => eb.fn.count('x').as('count'))
							.executeTakeFirst(),
					])

					const transfers: TokenTransfer[] = transfersResult.map((row) => ({
						from: row.from,
						to: row.to,
						value: String(row.tokens),
						transactionHash: row.tx_hash,
						blockNumber: String(row.block_num),
						logIndex: Number(row.log_idx),
						timestamp: row.block_timestamp ? String(row.block_timestamp) : null,
					}))

					const total = Number(countResult?.count ?? 0)
					const hasMore = offset + transfers.length < total

					return paginatedResponse(transfers, {
						total,
						offset: offset + transfers.length,
						limit,
						hasMore,
					})
				} catch (error) {
					console.error('Token transfers error:', error)
					return serverError('Failed to fetch token transfers')
				}
			},
		},
	},
})
