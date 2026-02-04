import { createServerFn } from '@tanstack/react-start'
import * as IDX from 'idxs'
import type { Address } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import * as ABIS from '#lib/abis'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { fetchHoldersCountCached } from '#lib/server/token.server.ts'
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
			includeCount
				? // count is an expensive, columnar-based query. we will count up
					// to the first countLimit rows (default: TOKEN_COUNT_MAX)
					QB.selectFrom(
						QB.withSignatures([eventSignature])
							.selectFrom('tokencreated')
							.select((eb) => eb.lit(1).as('x'))
							.where('chain', '=', chainId as never)
							.limit(countLimit)
							.as('subquery'),
					)
						.select((eb) => eb.fn.count('x').as('count'))
						.executeTakeFirst()
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

		const count = countResult?.count ?? null

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
