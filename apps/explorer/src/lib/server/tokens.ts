import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import {
	fetchTokenCreatedCount,
	fetchTokenCreatedRows,
} from '#lib/server/tempo-queries'
import { fetchHoldersCountCached } from '#lib/server/token.ts'
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

		const config = getWagmiConfig()
		const chainId = getChainId(config)

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
