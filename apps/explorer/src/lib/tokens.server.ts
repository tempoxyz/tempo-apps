import { createServerFn } from '@tanstack/react-start'
import * as IDX from 'idxs'
import type { Address } from 'ox'
import * as z from 'zod/mini'
import { config } from '#wagmi.config.ts'

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

		const chainId = config.getClient().chain.id

		const tokensResult = await QB.withSignatures([EVENT_SIGNATURE])
			.selectFrom('tokencreated')
			.select(['token', 'symbol', 'name', 'currency', 'block_timestamp'])
			.where('chain', '=', chainId)
			.orderBy('block_timestamp', 'desc')
			.limit(limit)
			.offset(offset)
			.execute()

		const { count } = await QB.withSignatures([EVENT_SIGNATURE])
			.selectFrom('tokencreated')
			.select((eb) => eb.fn.count('token').as('count'))
			.where('chain', '=', chainId)
			.executeTakeFirstOrThrow()

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
