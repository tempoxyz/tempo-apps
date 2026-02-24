import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import * as z from 'zod/mini'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import {
	fetchTokenCreatedCount,
	fetchTokenCreatedRows,
} from '#lib/server/tempo-queries'
import { fetchHoldersCountCached } from '#lib/server/token.server.ts'
import { getServerChainId } from '#wagmi.config.ts'

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
	limit: z.coerce.number().check(z.gte(1), z.lte(100)),
	includeCount: z.optional(z.boolean()),
	countLimit: z.optional(z.coerce.number().check(z.gte(1))),
	includeHolders: z.optional(z.boolean()),
})

export type TokensApiResponse = {
	tokens: Token[]
	total: number | null
	offset: number
	limit: number
}

// Static token data for Signet chains (no IndexSupply available)
const SIGNET_TOKENS: Record<number, Token[]> = {
	// Parmigiana rollup (chain 88888)
	88888: [
		{ address: '0x0000000000000000007369676e65742d77757364' as Address.Address, symbol: 'wUSD', name: 'Wrapped USD', currency: 'USD', createdAt: 0 },
		{ address: '0x0000000000000000007369676e65742d77657468' as Address.Address, symbol: 'wETH', name: 'Wrapped Ether', currency: 'ETH', createdAt: 0 },
		{ address: '0x0000000000000000007369676e65742D77627463' as Address.Address, symbol: 'wBTC', name: 'Wrapped Bitcoin', currency: 'BTC', createdAt: 0 },
	],
	// Host chain (chain 3151908)
	3151908: [
		{ address: '0x65fb255585458de1f9a246b476aa8d5c5516f6fd' as Address.Address, symbol: 'USDC', name: 'USD Coin', currency: 'USD', createdAt: 0 },
		{ address: '0xb9df1b911b6cf6935b2a918ba03df2372e94e267' as Address.Address, symbol: 'USDT', name: 'Tether USD', currency: 'USD', createdAt: 0 },
		{ address: '0xfb29f7d7a4ce607d6038d44150315e5f69bea08a' as Address.Address, symbol: 'WBTC', name: 'Wrapped Bitcoin', currency: 'BTC', createdAt: 0 },
		{ address: '0xD1278f17e86071f1E658B656084c65b7FD3c90eF' as Address.Address, symbol: 'WETH', name: 'Wrapped Ether', currency: 'ETH', createdAt: 0 },
	],
}

export const SIGNET_TOKEN_COUNTS: Record<number, number> = Object.fromEntries(
	Object.entries(SIGNET_TOKENS).map(([chainId, tokens]) => [Number(chainId), tokens.length]),
)

export const fetchTokens = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokensInputSchema.parse(input))
	.handler(async ({ data }): Promise<TokensApiResponse> => {
		const {
			offset,
			limit,
			includeCount = false,
			countLimit = TOKEN_COUNT_MAX,
			includeHolders = false,
		} = data

		const chainId = getServerChainId()

		// Return static token list for Signet chains
		const signetTokens = SIGNET_TOKENS[chainId]
		if (signetTokens) {
			const sliced = signetTokens.slice(offset, offset + limit)
			return {
				offset,
				limit,
				total: signetTokens.length,
				tokens: sliced,
			}
		}

		const [tokensResult, countResult] = await Promise.all([
			fetchTokenCreatedRows(chainId, limit, offset),
			includeCount
				? fetchTokenCreatedCount(chainId, countLimit)
				: Promise.resolve(null),
		])

		const holdersCounts = new Map<string, { count: number; capped: boolean }>()

		if (includeHolders && tokensResult.length > 0) {
			const holdersResults = await mapWithConcurrency(
				tokensResult,
				4,
				async (tokenRow) => {
					try {
						const result = await fetchHoldersCountCached(
							tokenRow.token as Address.Address,
							chainId,
						)
						return [tokenRow.token, result] as const
					} catch (error) {
						console.error('Failed to fetch holders count:', error)
						return null
					}
				},
			)

			for (const entry of holdersResults) {
				if (!entry) continue
				holdersCounts.set(entry[0], entry[1])
			}
		}

		const count = countResult ?? null

		return {
			offset,
			limit,
			total: count !== null ? Number(count) : null,
			tokens: tokensResult.map(
				({ token: address, block_timestamp, ...rest }) => ({
					...rest,
					address,
					createdAt: Number(block_timestamp),
					holdersCount: holdersCounts.get(address)?.count,
					holdersCountCapped: holdersCounts.get(address)?.capped,
				}),
			),
		}
	})

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length)
	let index = 0

	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (true) {
				const current = index
				index += 1
				if (current >= items.length) break
				results[current] = await fn(items[current])
			}
		},
	)

	await Promise.all(workers)
	return results
}
