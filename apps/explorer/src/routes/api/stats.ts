import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { getChainId } from 'wagmi/actions'
import * as ABIS from '#lib/abis'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { getWagmiConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

// Average block time on Tempo is 0.5 seconds
const AVERAGE_BLOCK_TIME_SECONDS = 0.5
const BLOCKS_PER_DAY = Math.floor((24 * 60 * 60) / AVERAGE_BLOCK_TIME_SECONDS)

// Cache stats for 60 seconds to avoid rate limiting
const CACHE_TTL_MS = 60_000
let cachedStats: StatsApiResponse['data'] | null = null
let cacheTimestamp = 0
let fetchInProgress: Promise<StatsApiResponse['data']> | null = null

export type StatsApiResponse = {
	data: {
		transactions24h: number
		tokens: number
		accounts24h: number
	} | null
	error: string | null
}

async function fetchStatsFromIndexer(): Promise<StatsApiResponse['data']> {
	const config = getWagmiConfig()
	const chainId = getChainId(config)
	const tokenCreatedSignature = ABIS.getTokenCreatedEvent(chainId)

	// Get latest block number to calculate 24h window
	const latestBlockResult = await QB.selectFrom('blocks')
		.select('num')
		.where('chain', '=', chainId)
		.orderBy('num', 'desc')
		.limit(1)
		.executeTakeFirst()

	const latestBlock = BigInt(latestBlockResult?.num ?? 0)
	const block24hAgo = latestBlock - BigInt(BLOCKS_PER_DAY)
	const block24hAgoSafe = block24hAgo < 0n ? 0n : block24hAgo

	// Get token count
	const tokensCountResult = await QB.selectFrom(
		QB.withSignatures([tokenCreatedSignature])
			.selectFrom('tokencreated')
			.select((eb) => eb.lit(1).as('x'))
			.where('chain', '=', chainId as never)
			.limit(TOKEN_COUNT_MAX)
			.as('subquery'),
	)
		.select((eb) => eb.fn.count('x').as('count'))
		.executeTakeFirst()

	// Get transaction count (24h)
	const txCount24hResult = await QB.selectFrom('txs')
		.select((eb) => eb.fn.count('hash').as('count'))
		.where('chain', '=', chainId)
		.where('block_num', '>=', block24hAgoSafe)
		.executeTakeFirst()

	// Get active accounts (sample recent txs and count unique senders)
	const accounts24hResult = await QB.selectFrom('txs')
		.select(['from'])
		.where('chain', '=', chainId)
		.where('block_num', '>=', block24hAgoSafe)
		.limit(50_000)
		.execute()

	const uniqueAccounts = new Set(accounts24hResult?.map((tx) => tx.from) ?? [])

	return {
		transactions24h: Number(txCount24hResult?.count ?? 0),
		tokens: Number(tokensCountResult?.count ?? 0),
		accounts24h: uniqueAccounts.size,
	}
}

export const Route = createFileRoute('/api/stats')({
	server: {
		handlers: {
			GET: async () => {
				const now = Date.now()
				const cacheAge = now - cacheTimestamp
				const isCacheValid = cachedStats && cacheAge < CACHE_TTL_MS

				// Return cached data if still valid
				if (isCacheValid) {
					const remainingTtl = Math.max(
						1,
						Math.floor((CACHE_TTL_MS - cacheAge) / 1000),
					)
					return Response.json(
						{ data: cachedStats, error: null } satisfies StatsApiResponse,
						{ headers: { 'Cache-Control': `public, max-age=${remainingTtl}` } },
					)
				}

				// If a fetch is already in progress, wait for it (prevents thundering herd)
				if (fetchInProgress) {
					try {
						const data = await fetchInProgress
						return Response.json(
							{ data, error: null } satisfies StatsApiResponse,
							{ headers: { 'Cache-Control': 'public, max-age=60' } },
						)
					} catch {
						// Fall through to try fresh fetch
					}
				}

				try {
					fetchInProgress = fetchStatsFromIndexer()
					const data = await fetchInProgress

					cachedStats = data
					cacheTimestamp = now
					fetchInProgress = null

					return Response.json(
						{ data, error: null } satisfies StatsApiResponse,
						{ headers: { 'Cache-Control': 'public, max-age=60' } },
					)
				} catch (error) {
					fetchInProgress = null
					console.error('[stats] Failed to fetch stats:', error)

					// Return stale cache if available (stale-while-error pattern)
					if (cachedStats) {
						return Response.json(
							{ data: cachedStats, error: null } satisfies StatsApiResponse,
							{ headers: { 'Cache-Control': 'public, max-age=10' } },
						)
					}

					const errorMessage =
						error instanceof Error ? error.message : 'Unknown error'
					return Response.json(
						{ data: null, error: errorMessage } satisfies StatsApiResponse,
						{ status: 500 },
					)
				}
			},
		},
	},
})
