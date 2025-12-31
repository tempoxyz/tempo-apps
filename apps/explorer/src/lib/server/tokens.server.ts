import { createServerFn } from '@tanstack/react-start'
import * as IDX from 'idxs'
import type { Address } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { getWagmiConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

export type Token = {
	address: Address.Address
	symbol: string
	name: string
	currency: string
	createdAt: number
}

const FetchTokensInputSchema = z.object({
	offset: z.coerce.number().check(z.gte(0)),
	limit: z.coerce.number().check(z.gte(1), z.lte(100)),
})

export type TokensApiResponse = {
	tokens: Token[]
	total: number
	offset: number
	limit: number
}

const EVENT_SIGNATURE =
	'event TokenCreated(address indexed token, uint256 indexed tokenId, string name, string symbol, string currency, address quoteToken, address admin)'

export const fetchTokens = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokensInputSchema.parse(input))
	.handler(async ({ data }): Promise<TokensApiResponse> => {
		const { offset, limit } = data

		const config = getWagmiConfig()
		const chainId = getChainId(config)

		const [tokensResult, countResult] = await Promise.all([
			QB.withSignatures([EVENT_SIGNATURE])
				.selectFrom('tokencreated')
				.select(['token', 'symbol', 'name', 'currency', 'block_timestamp'])
				.where('chain', '=', chainId)
				.orderBy('block_num', 'desc')
				.limit(limit)
				.offset(offset)
				.execute(),
			// count is an expensive, columnar-based query. we will count up
			// to the first 100k rows
			QB.selectFrom(
				QB.withSignatures([EVENT_SIGNATURE])
					.selectFrom('tokencreated')
					.select((eb) => eb.lit(1).as('x'))
					.where('chain', '=', chainId)
					.limit(100_000)
					.as('subquery'),
			)
				.select((eb) => eb.fn.count('x').as('count'))
				.executeTakeFirst(),
		])

		const count = countResult?.count ?? 0

		return {
			offset,
			limit,
			total: Number(count),
			tokens: tokensResult.map(
				({ token: address, block_timestamp, ...rest }) => ({
					...rest,
					address,
					createdAt: Number(block_timestamp),
				}),
			),
		}
	})
