import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import {
	fetchTokenCreatedRows,
	fetchTokenHoldersCountRows,
} from '#lib/server/tempo-queries'
import { getWagmiConfig } from '#wagmi.config.ts'

export type Token = {
	address: Address.Address
	symbol: string
	name: string
	currency: string
	createdAt: number
	holdersCount?: number
	holdersCountCapped?: boolean
}

const FetchTokensInputSchema = z.object({
	offset: z.coerce.number().check(z.gte(0)),
	limit: z.coerce.number().check(z.gte(1), z.lte(25)),
})

export type TokensApiResponse = {
	tokens: Token[]
	offset: number
	limit: number
}

export const fetchTokens = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokensInputSchema.parse(input))
	.handler(async ({ data }): Promise<TokensApiResponse> => {
		const { offset, limit } = data

		const config = getWagmiConfig()
		const chainId = getChainId(config)

		const tokensResult = await fetchTokenCreatedRows(chainId, limit, offset)

		const holdersCounts = new Map<string, { count: number; capped: boolean }>()

		if (tokensResult.length > 0) {
			try {
				const holdersResults = await fetchTokenHoldersCountRows(
					tokensResult.map((row) => row.token as Address.Address),
					chainId,
					TOKEN_COUNT_MAX,
				)

				for (const entry of holdersResults) {
					holdersCounts.set(entry.token, {
						count: entry.count,
						capped: entry.capped,
					})
				}
			} catch (error) {
				console.error('Failed to fetch holders counts:', error)
			}
		}

		return {
			offset,
			limit,
			tokens: tokensResult.map(
				({ token: address, block_timestamp, ...rest }) => ({
					...rest,
					address,
					createdAt: Number(block_timestamp),
					holdersCount: holdersCounts.get(address.toLowerCase())?.count,
					holdersCountCapped: holdersCounts.get(address.toLowerCase())?.capped,
				}),
			),
		}
	})
