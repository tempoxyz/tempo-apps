import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import {
	type TokenCreatedRow,
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

const SPAM_TOKEN_PATTERN = /\btest|test\b|\bfake|fake\b/i

function isSpamToken(row: TokenCreatedRow): boolean {
	return SPAM_TOKEN_PATTERN.test(row.name) || SPAM_TOKEN_PATTERN.test(row.symbol)
}

/** Mainnet chain ID */
const TEMPO_MAINNET_CHAIN_ID = 4217

export const fetchTokens = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokensInputSchema.parse(input))
	.handler(async ({ data }): Promise<TokensApiResponse> => {
		const { offset, limit } = data

		const config = getWagmiConfig()
		const chainId = getChainId(config)

		const shouldFilter = chainId === TEMPO_MAINNET_CHAIN_ID

		let tokensResult: TokenCreatedRow[]

		if (shouldFilter) {
			// Over-fetch and filter out spam tokens, then apply pagination
			const batchSize = limit * 3
			const collected: TokenCreatedRow[] = []
			let dbOffset = 0

			// Fetch enough rows to skip `offset` valid tokens and collect `limit` more
			while (collected.length < offset + limit) {
				const batch = await fetchTokenCreatedRows(chainId, batchSize, dbOffset)
				if (batch.length === 0) break

				for (const row of batch) {
					if (!isSpamToken(row)) {
						collected.push(row)
					}
				}
				dbOffset += batch.length

				// Safety: if we've scanned many rows without filling, break
				if (dbOffset > (offset + limit) * 10) break
			}

			tokensResult = collected.slice(offset, offset + limit)
		} else {
			tokensResult = await fetchTokenCreatedRows(chainId, limit, offset)
		}

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
