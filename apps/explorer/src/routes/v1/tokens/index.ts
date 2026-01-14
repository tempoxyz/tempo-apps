import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import type { TokenInfo } from '../_types'
import {
	badRequest,
	corsPreflightResponse,
	DEFAULT_LIMIT,
	MAX_LIMIT,
	paginatedResponse,
	serverError,
} from '../_utils'
import * as ABIS from '#lib/abis'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { getWagmiConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const QuerySchema = z.object({
	offset: z.prefault(z.coerce.number(), 0),
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
})

export const Route = createFileRoute('/v1/tokens/')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async ({ request }) => {
				try {
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
					const eventSignature = ABIS.getTokenCreatedEvent(chainId)

					const [tokensResult, countResult] = await Promise.all([
						QB.withSignatures([eventSignature])
							.selectFrom('tokencreated')
							.select(['token', 'symbol', 'name', 'currency', 'block_timestamp'])
							.where('chain', '=', chainId as never)
							.orderBy('block_num', 'desc')
							.limit(limit)
							.offset(offset)
							.execute(),
						QB.selectFrom(
							QB.withSignatures([eventSignature])
								.selectFrom('tokencreated')
								.select((eb) => eb.lit(1).as('x'))
								.where('chain', '=', chainId as never)
								.limit(TOKEN_COUNT_MAX)
								.as('subquery'),
						)
							.select((eb) => eb.fn.count('x').as('count'))
							.executeTakeFirst(),
					])

					const tokens: TokenInfo[] = tokensResult.map(
						({ token: address, block_timestamp, ...rest }) => ({
							...rest,
							address,
							createdAt: Number(block_timestamp),
						}),
					)

					const total = Number(countResult?.count ?? 0)
					const hasMore = offset + tokens.length < total

					return paginatedResponse(tokens, {
						total,
						offset: offset + tokens.length,
						limit,
						hasMore,
					})
				} catch (error) {
					console.error('Tokens list error:', error)
					return serverError('Failed to fetch tokens')
				}
			},
		},
	},
})
