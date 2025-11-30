import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import * as z from 'zod/mini'
import * as IS from '#lib/index-supply'
import { parsePgTimestamp } from '#lib/postgres'

const { chainId } = IS

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

export type FetchTokensInput = z.infer<typeof FetchTokensInputSchema>

export type TokensApiResponse = {
	tokens: Token[]
	total: number
	offset: number
	limit: number
}

const EVENT_SIGNATURE =
	'TokenCreated(address indexed token, uint256 indexed tokenId, string name, string symbol, string currency, address quoteToken, address admin)'

export const fetchTokens = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokensInputSchema.parse(input))
	.handler(async ({ data }): Promise<TokensApiResponse> => {
		const { offset, limit } = data

		const [tokensResult, countResult] = await Promise.all([
			IS.runIndexSupplyQuery(
				`SELECT token, symbol, name, currency, block_timestamp FROM tokencreated
				 WHERE chain = ${chainId}
				 ORDER BY block_timestamp DESC
				 LIMIT ${limit} OFFSET ${offset}`,
				{ signatures: [EVENT_SIGNATURE] },
			),
			IS.runIndexSupplyQuery(
				`SELECT COUNT(token) FROM tokencreated
				 WHERE chain = ${chainId}`,
				{ signatures: [EVENT_SIGNATURE] },
			),
		])

		const tokens: Token[] = tokensResult.rows.map((row) => ({
			address: row[0] as Address.Address,
			symbol: String(row[1]),
			name: String(row[2]),
			currency: String(row[3]),
			createdAt: parsePgTimestamp(String(row[4])),
		}))

		const total = Number(countResult.rows[0]?.[0] ?? 0)

		return {
			tokens,
			total,
			offset,
			limit,
		}
	})
