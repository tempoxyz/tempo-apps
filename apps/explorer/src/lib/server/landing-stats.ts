import { createServerFn } from '@tanstack/react-start'
import type { Address, Hex } from 'ox'
import { sql } from 'tidx.ts'
import { getChainId, readContracts } from 'wagmi/actions'
import * as ABIS from '#lib/abis'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import {
	fetchGenesisBlockTimestamp,
	fetchLatestBlockNumber,
	fetchTokenHoldersCount,
} from '#lib/server/tempo-queries'
import {
	tempoFastLookupQueryBuilder,
	tempoQueryBuilder,
} from '#lib/server/tempo-queries-provider'
import { getTokenListEntries } from '#lib/server/tokens'
import { parseTimestamp } from '#lib/timestamp'
import { getWagmiConfig } from '#wagmi.config'

const QB = tempoQueryBuilder
const FAST = tempoFastLookupQueryBuilder

/** Default window for recent block tiles (covers ~5 min at 1s blocks). */
const RECENT_BLOCKS_LIMIT = 300
const TOKEN_LAUNCH_WINDOW_DAYS = 30

export type HeatmapWindow = '7d' | '30d' | '90d'

const HEATMAP_WINDOW_HOURS: Record<HeatmapWindow, number> = {
	'7d': 7 * 24,
	'30d': 30 * 24,
	'90d': 90 * 24,
}
const NOTABLE_TX_LIMIT = 8
const TOP_TOKENS_LIMIT = 6
/** Consider at most this many tokens from the tokenlist for ranking (keeps cost bounded). */
const TOP_TOKENS_CANDIDATE_CAP = 10

// ---------- Recent blocks (Network Pulse / Block Time / Gas Usage) --------- //

export type RecentBlockRow = {
	num: number
	timestamp: number
	gas_used: number
	gas_limit: number
	miner: Address.Address
}

export type LandingRecentBlocks = {
	blocks: RecentBlockRow[]
	latestBlockNumber: number
}

export const fetchLandingRecentBlocks = createServerFn({
	method: 'GET',
}).handler(async (): Promise<LandingRecentBlocks> => {
	const config = getWagmiConfig()
	const chainId = getChainId(config)

	const rows = await QB(chainId)
		.selectFrom('blocks')
		.select(['num', 'timestamp', 'gas_used', 'gas_limit', 'miner'])
		.orderBy('num', 'desc')
		.limit(RECENT_BLOCKS_LIMIT)
		.execute()

	const blocks: RecentBlockRow[] = rows
		.map((row) => ({
			num: Number(row.num),
			timestamp: parseTimestamp(row.timestamp) ?? 0,
			gas_used: Number(row.gas_used ?? 0),
			gas_limit: Number(row.gas_limit ?? 0),
			miner: row.miner as Address.Address,
		}))
		// present oldest-first so charts scan left to right
		.sort((a, b) => a.num - b.num)

	const latestBlockNumber = blocks.length ? blocks[blocks.length - 1].num : 0

	return { blocks, latestBlockNumber }
})

// ---------- Activity heatmap (tx count per hour for last 7 days) --------- //

export type HeatmapBucket = {
	/** Hour bucket (unix seconds at the top of the hour). */
	hour: number
	count: number
}

export type LandingHeatmap = {
	buckets: HeatmapBucket[]
	windowStart: number
	windowEnd: number
}

function parseHeatmapWindow(input: unknown): { window: HeatmapWindow } {
	const value = (input as { window?: string } | undefined)?.window
	if (value === '7d' || value === '30d' || value === '90d') {
		return { window: value }
	}
	return { window: '7d' }
}

export const fetchLandingHeatmap = createServerFn({ method: 'GET' })
	.inputValidator(parseHeatmapWindow)
	.handler(async ({ data }): Promise<LandingHeatmap> => {
		const config = getWagmiConfig()
		const chainId = getChainId(config)

		const nowSec = Math.floor(Date.now() / 1000)
		const windowStart = nowSec - HEATMAP_WINDOW_HOURS[data.window] * 3600
		const windowEnd = nowSec

		try {
			// ClickHouse stores block_timestamp as DateTime64, so we can't divide
			// it by 3600; use toStartOfHour + toUnixTimestamp for bucketing.
			const rows = (await FAST(chainId)
				.selectFrom('txs')
				.select((eb) => [
					sql<number>`toUnixTimestamp(toStartOfHour(${eb.ref('block_timestamp')}))`.as(
						'hour',
					),
					eb.fn.count('hash').as('count'),
				])
				.where(
					'block_timestamp',
					'>=',
					sql`toDateTime(${windowStart})` as never,
				)
				.groupBy(sql`toStartOfHour(block_timestamp)`)
				.orderBy(sql`toStartOfHour(block_timestamp)`, 'asc')
				.execute()) as Array<{ hour: number | string; count: number | string }>

			const buckets: HeatmapBucket[] = rows.map((row) => ({
				hour: Number(row.hour),
				count: Number(row.count),
			}))

			return { buckets, windowStart, windowEnd }
		} catch (error) {
			console.error('[landing] heatmap query failed:', error)
			return { buckets: [], windowStart, windowEnd }
		}
	})

// ---------- Activity heatmap — gas summed per hour ----------------------- //

export const fetchLandingHeatmapGas = createServerFn({ method: 'GET' })
	.inputValidator(parseHeatmapWindow)
	.handler(async ({ data }): Promise<LandingHeatmap> => {
		const config = getWagmiConfig()
		const chainId = getChainId(config)

		const nowSec = Math.floor(Date.now() / 1000)
		const windowStart = nowSec - HEATMAP_WINDOW_HOURS[data.window] * 3600
		const windowEnd = nowSec

		try {
			const rows = (await FAST(chainId)
				.selectFrom('blocks')
				.select((eb) => [
					sql<number>`toUnixTimestamp(toStartOfHour(${eb.ref('timestamp')}))`.as(
						'hour',
					),
					sql<string>`sum(${eb.ref('gas_used')})`.as('count'),
				])
				.where('timestamp', '>=', sql`toDateTime(${windowStart})` as never)
				.groupBy(sql`toStartOfHour(timestamp)`)
				.orderBy(sql`toStartOfHour(timestamp)`, 'asc')
				.execute()) as Array<{ hour: number | string; count: number | string }>

			const buckets: HeatmapBucket[] = rows.map((row) => ({
				hour: Number(row.hour),
				count: Number(row.count),
			}))

			return { buckets, windowStart, windowEnd }
		} catch (error) {
			console.error('[landing] heatmap gas query failed:', error)
			return { buckets: [], windowStart, windowEnd }
		}
	})

// ---------- Tx rate over arbitrary window -------------------------------- //

export type TxRateWindow = '1h' | '24h' | '7d'

export type LandingTxRate = {
	count: number
	capped: boolean
	windowSecs: number
}

const WINDOW_SECONDS: Record<TxRateWindow, number> = {
	'1h': 60 * 60,
	'24h': 24 * 60 * 60,
	'7d': 7 * 24 * 60 * 60,
}

export const fetchLandingTxRate = createServerFn({ method: 'GET' })
	.inputValidator((input: unknown): { window: TxRateWindow } => {
		const value = (input as { window?: string } | undefined)?.window
		if (value === '1h' || value === '24h' || value === '7d') {
			return { window: value }
		}
		return { window: '24h' }
	})
	.handler(async ({ data }): Promise<LandingTxRate> => {
		const config = getWagmiConfig()
		const chainId = getChainId(config)

		const windowSecs = WINDOW_SECONDS[data.window]
		const start = Math.floor(Date.now() / 1000) - windowSecs

		try {
			const result = await FAST(chainId)
				.selectFrom(
					FAST(chainId)
						.selectFrom('txs')
						.select((eb) => eb.lit(1).as('x'))
						.where('block_timestamp', '>=', sql`toDateTime(${start})` as never)
						.limit(TOKEN_COUNT_MAX)
						.as('sub'),
				)
				.select((eb) => eb.fn.count('x').as('count'))
				.executeTakeFirst()

			const count = Number(result?.count ?? 0)
			return {
				count,
				capped: count >= TOKEN_COUNT_MAX,
				windowSecs,
			}
		} catch (error) {
			console.error('[landing] tx rate query failed:', error)
			return { count: 0, capped: false, windowSecs }
		}
	})

// ---------- Chain vitals (24h tx count, genesis, latest) ----------------- //

export type LandingChainVitals = {
	latestBlockNumber: number
	genesisTimestamp: number | null
	txCount24h: number
	txCount24hCapped: boolean
	/** Chain id for display. */
	chainId: number
}

export const fetchLandingChainVitals = createServerFn({
	method: 'GET',
}).handler(async (): Promise<LandingChainVitals> => {
	const config = getWagmiConfig()
	const chainId = getChainId(config)

	const nowSec = Math.floor(Date.now() / 1000)
	const dayAgo = nowSec - 24 * 60 * 60

	const [latestBlockNumber, genesisTs, txCountResult] = await Promise.all([
		fetchLatestBlockNumber(chainId).catch(() => 0n),
		fetchGenesisBlockTimestamp(chainId).catch(() => null),
		FAST(chainId)
			.selectFrom(
				FAST(chainId)
					.selectFrom('txs')
					.select((eb) => eb.lit(1).as('x'))
					.where('block_timestamp', '>=', sql`toDateTime(${dayAgo})` as never)
					.limit(TOKEN_COUNT_MAX)
					.as('sub'),
			)
			.select((eb) => eb.fn.count('x').as('count'))
			.executeTakeFirst()
			.catch((error) => {
				console.error('[landing] 24h tx count failed:', error)
				return undefined
			}),
	])

	const genesisTimestamp = parseTimestamp(genesisTs) ?? null
	const txCount24h = Number(txCountResult?.count ?? 0)
	const txCount24hCapped = txCount24h >= TOKEN_COUNT_MAX

	return {
		latestBlockNumber: Number(latestBlockNumber),
		genesisTimestamp,
		txCount24h,
		txCount24hCapped,
		chainId,
	}
})

// ---------- Token launches (last 30 days) -------------------------------- //

export type LandingTokenLaunch = {
	address: Address.Address
	name: string
	symbol: string
	currency: string
	timestamp: number
}

export type LandingTokenLaunches = {
	dailyCounts: Array<{ day: number; count: number }>
	latest: LandingTokenLaunch[]
	windowStart: number
	windowEnd: number
}

export const fetchLandingTokenLaunches = createServerFn({
	method: 'GET',
}).handler(async (): Promise<LandingTokenLaunches> => {
	const config = getWagmiConfig()
	const chainId = getChainId(config)

	const eventSignature = ABIS.getTokenCreatedEvent(chainId)

	const nowSec = Math.floor(Date.now() / 1000)
	const windowStart = nowSec - TOKEN_LAUNCH_WINDOW_DAYS * 24 * 3600
	const windowEnd = nowSec

	try {
		// Use the decoded-event virtual table — the topic0-only raw logs
		// query doesn't scale on tidx, but `tokencreated` is indexed by
		// block_num and very fast.
		const rows = await QB(chainId)
			.withSignatures([eventSignature])
			.selectFrom('tokencreated')
			.select(['token', 'name', 'symbol', 'currency', 'block_timestamp'])
			.orderBy('block_num', 'desc')
			.orderBy('log_idx', 'desc')
			.limit(500)
			.execute()

		const latest: LandingTokenLaunch[] = []
		const dayBuckets = new Map<number, number>()

		for (const row of rows) {
			const ts = parseTimestamp(row.block_timestamp)
			if (ts == null || ts <= 0) continue
			if (ts < windowStart) continue
			const day = Math.floor(ts / 86400)
			dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1)

			if (latest.length < 10 && row.token) {
				latest.push({
					address: row.token as Address.Address,
					name: String(row.name ?? ''),
					symbol: String(row.symbol ?? ''),
					currency: String(row.currency ?? ''),
					timestamp: ts,
				})
			}
		}

		const dailyCounts = Array.from(dayBuckets.entries())
			.map(([day, count]) => ({ day, count }))
			.sort((a, b) => a.day - b.day)

		return { dailyCounts, latest, windowStart, windowEnd }
	} catch (error) {
		console.error('[landing] token launches query failed:', error)
		return { dailyCounts: [], latest: [], windowStart, windowEnd }
	}
})

// ---------- Top tokens by holders ---------------------------------------- //

export type LandingTopToken = {
	address: Address.Address
	symbol: string
	name: string
	count: number
	capped: boolean
}

export const fetchLandingTopTokens = createServerFn({ method: 'GET' }).handler(
	async (): Promise<LandingTopToken[]> => {
		const config = getWagmiConfig()
		const chainId = getChainId(config)

		const entries = await getTokenListEntries(chainId)
		if (entries.length === 0) return []

		const candidates = entries.slice(0, TOP_TOKENS_CANDIDATE_CAP)

		// Per-token queries (in parallel). The batched `fetchTokenHoldersCountRows`
		// path tends to 422 on tidx when several tokens with large transfer
		// histories are combined into a single GROUP BY.
		const results = await Promise.allSettled(
			candidates.map(async (entry) => {
				const address = entry.address as Address.Address
				const { count, capped } = await fetchTokenHoldersCount(
					address,
					chainId,
					TOKEN_COUNT_MAX,
				)
				return {
					address,
					symbol: entry.symbol,
					name: entry.name,
					count,
					capped,
				}
			}),
		)

		const tokens: LandingTopToken[] = []
		for (const r of results) {
			if (r.status === 'fulfilled') tokens.push(r.value)
			else console.error('[landing] top tokens per-token failed:', r.reason)
		}

		return tokens.sort((a, b) => b.count - a.count).slice(0, TOP_TOKENS_LIMIT)
	},
)

// ---------- Popular contract invocations (last 24h) ---------------------- //

export type LandingPopularCall = {
	to: Address.Address
	selector: Hex.Hex
	count: number
}

export const fetchLandingPopularCalls = createServerFn({ method: 'GET' })
	.inputValidator((input: unknown): { window: TxRateWindow } => {
		const value = (input as { window?: string } | undefined)?.window
		if (value === '1h' || value === '24h' || value === '7d') {
			return { window: value }
		}
		return { window: '24h' }
	})
	.handler(async ({ data }): Promise<LandingPopularCall[]> => {
		const config = getWagmiConfig()
		const chainId = getChainId(config)

		const nowSec = Math.floor(Date.now() / 1000)
		const windowStart = nowSec - WINDOW_SECONDS[data.window]

		try {
			const rows = (await FAST(chainId)
				.selectFrom('txs')
				.select((eb) => [
					eb.ref('to').as('to'),
					sql<string>`substring(${eb.ref('input')}, 1, 10)`.as('selector'),
					eb.fn.count('hash').as('count'),
				])
				.where(
					'block_timestamp',
					'>=',
					sql`toDateTime(${windowStart})` as never,
				)
				.where('input', '!=', '0x' as never)
				.groupBy(['to', sql`substring(input, 1, 10)`] as never)
				.orderBy('count', 'desc')
				.limit(10)
				.execute()) as Array<{
				to: string
				selector: string
				count: number | string
			}>

			return rows
				.filter((r) => r.to && r.selector && r.selector.length === 10)
				.map((r) => ({
					to: r.to as Address.Address,
					selector: r.selector as Hex.Hex,
					count: Number(r.count),
				}))
		} catch (error) {
			console.error('[landing] popular calls query failed:', error)
			return []
		}
	})

// ---------- TVL snapshot (current top-token total supplies) -------------- //

export type LandingTvlToken = {
	address: Address.Address
	symbol: string
	name: string
	totalSupply: string
	decimals: number
	usdValue: number
}

export type LandingTvlSnapshot = {
	tokens: LandingTvlToken[]
	other: {
		totalSupply: string
		usdValue: number
		count: number
	}
	totalUsd: number
}

const ERC20_ABI = [
	{
		type: 'function',
		name: 'totalSupply',
		inputs: [],
		outputs: [{ type: 'uint256' }],
		stateMutability: 'view',
	},
	{
		type: 'function',
		name: 'decimals',
		inputs: [],
		outputs: [{ type: 'uint8' }],
		stateMutability: 'view',
	},
] as const

export const fetchLandingTvlSeries = createServerFn({
	method: 'GET',
}).handler(async (): Promise<LandingTvlSnapshot> => {
	const config = getWagmiConfig()
	const chainId = getChainId(config)

	const entries = await getTokenListEntries(chainId)
	if (entries.length === 0) {
		return {
			tokens: [],
			other: { totalSupply: '0', usdValue: 0, count: 0 },
			totalUsd: 0,
		}
	}

	try {
		const contracts = entries.flatMap((entry) => [
			{
				address: entry.address as Address.Address,
				abi: ERC20_ABI,
				functionName: 'totalSupply' as const,
			},
			{
				address: entry.address as Address.Address,
				abi: ERC20_ABI,
				functionName: 'decimals' as const,
			},
		])

		const results = await readContracts(config, {
			contracts,
			allowFailure: true,
		})

		type Enriched = {
			address: Address.Address
			symbol: string
			name: string
			totalSupply: bigint
			decimals: number
			usdValue: number
		}

		const enriched: Enriched[] = entries
			.map((entry, i) => {
				const supplyResult = results[i * 2]?.result as bigint | undefined
				const decimalsResult = results[i * 2 + 1]?.result as
					| number
					| bigint
					| undefined
				if (supplyResult == null) return null
				const decimals = Number(decimalsResult ?? 18)
				// Normalize to USD: stablecoin tokens on Tempo are 1:1. Divide
				// supply by 10^decimals using bigint-safe arithmetic.
				const scale = BigInt(Math.max(1, decimals))
				const divisor = 10n ** scale
				// Keep 2 decimals of precision via *100 / divisor.
				const scaled =
					Number((supplyResult * 100n) / (divisor > 0n ? divisor : 1n)) / 100
				return {
					address: entry.address as Address.Address,
					symbol: entry.symbol,
					name: entry.name,
					totalSupply: supplyResult,
					decimals,
					usdValue: Number.isFinite(scaled) ? scaled : 0,
				}
			})
			.filter((t): t is Enriched => t != null)

		enriched.sort((a, b) => b.usdValue - a.usdValue)

		const top = enriched.slice(0, 5)
		const rest = enriched.slice(5)
		const otherUsd = rest.reduce((acc, t) => acc + t.usdValue, 0)
		const otherSupply = rest.reduce((acc, t) => acc + t.totalSupply, 0n)

		return {
			tokens: top.map((t) => ({
				address: t.address,
				symbol: t.symbol,
				name: t.name,
				totalSupply: t.totalSupply.toString(),
				decimals: t.decimals,
				usdValue: t.usdValue,
			})),
			other: {
				totalSupply: otherSupply.toString(),
				usdValue: otherUsd,
				count: rest.length,
			},
			totalUsd: enriched.reduce((acc, t) => acc + t.usdValue, 0),
		}
	} catch (error) {
		console.error('[landing] tvl snapshot query failed:', error)
		return {
			tokens: [],
			other: { totalSupply: '0', usdValue: 0, count: 0 },
			totalUsd: 0,
		}
	}
})

// ---------- Notable transactions (last 24h) ------------------------------ //

export type LandingNotableTx = {
	hash: Hex.Hex
	from: Address.Address
	to: Address.Address | null
	gas_used: string
	gas_price: string
	/** Effective gas price in gwei (display-ready string with up to 2 decimals). */
	gwei: string
	/** `gas_used` as a fraction of the block gas limit (0..1). */
	blockShare: number
	block_timestamp: number
	/** First 4-byte selector of the call (`0x...`) or empty for plain transfers. */
	selector: Hex.Hex | null
	/** Human-readable description, ideally derived from receipt logs. */
	description: string
}

export type LandingNotableTxs = {
	rows: LandingNotableTx[]
}

const KNOWN_SELECTORS: Record<string, string> = {
	'0xa9059cbb': 'transfer',
	'0x23b872dd': 'transferFrom',
	'0x095ea7b3': 'approve',
	'0x40c10f19': 'mint',
	'0x42966c68': 'burn',
	'0x79cc6790': 'burnFrom',
	'0x9dc29fac': 'burn',
	'0xd505accf': 'permit',
}

function describeCall(
	to: string | null,
	input: string | null | undefined,
): { selector: Hex.Hex | null; description: string } {
	if (!to) return { selector: null, description: 'Contract creation' }
	if (!input || input === '0x' || input.length < 10) {
		return { selector: null, description: 'Native call' }
	}
	const selector = input.slice(0, 10).toLowerCase() as Hex.Hex
	const fnName = KNOWN_SELECTORS[selector]
	if (fnName) {
		return {
			selector,
			description: `${fnName} → ${to.slice(0, 6)}…${to.slice(-4)}`,
		}
	}
	return {
		selector,
		description: `${selector} → ${to.slice(0, 6)}…${to.slice(-4)}`,
	}
}

const compactAmount = new Intl.NumberFormat('en-US', {
	notation: 'compact',
	maximumFractionDigits: 2,
})

function formatTokenAmount(tokens: bigint, decimals = 18): string {
	if (tokens === 0n) return '0'
	const scale = 10n ** BigInt(Math.max(0, decimals - 4))
	if (scale === 0n) return tokens.toString()
	const reduced = tokens / scale
	const value = Number(reduced) / 10 ** 4
	if (!Number.isFinite(value)) return tokens.toString()
	return compactAmount.format(value)
}

function gweiFromBigint(wei: bigint): string {
	if (wei === 0n) return '0'
	const integer = wei / 10n ** 9n
	const remainder = wei % 10n ** 9n
	if (integer >= 1000n) return integer.toLocaleString()
	const fractional = Number(remainder) / 1e9
	return (Number(integer) + fractional).toFixed(2)
}

export const fetchLandingNotableTxs = createServerFn({ method: 'GET' })
	.inputValidator((input: unknown): { window: TxRateWindow } => {
		const value = (input as { window?: string } | undefined)?.window
		if (value === '1h' || value === '24h' || value === '7d') {
			return { window: value }
		}
		return { window: '24h' }
	})
	.handler(async ({ data }): Promise<LandingNotableTxs> => {
		const config = getWagmiConfig()
		const chainId = getChainId(config)

		const nowSec = Math.floor(Date.now() / 1000)
		const windowStart = nowSec - WINDOW_SECONDS[data.window]
		const chWindow = sql`toDateTime(${windowStart})` as never

		try {
			const receipts = (await FAST(chainId)
				.selectFrom('receipts')
				.select([
					'tx_hash',
					'from',
					'to',
					'gas_used',
					'effective_gas_price',
					'block_timestamp',
				])
				.where('block_timestamp', '>=', chWindow)
				.orderBy('gas_used', 'desc')
				.limit(NOTABLE_TX_LIMIT)
				.execute()) as unknown as Array<{
				tx_hash: string
				from: string
				to: string | null
				gas_used: string | number | bigint
				effective_gas_price: string | number | bigint | null
				block_timestamp: string | number | null
			}>

			if (receipts.length === 0) return { rows: [] }

			const hashes = receipts.map((r) => r.tx_hash as Hex.Hex)

			// In parallel: lookup tx input/to (PG, cheap by hash) and the
			// largest decoded Transfer event per tx (for richer descriptions).
			const [tokenListEntries, latestBlockGasLimit] = await Promise.all([
				getTokenListEntries(chainId).catch(() => []),
				QB(chainId)
					.selectFrom('blocks')
					.select(['gas_limit'])
					.orderBy('num', 'desc')
					.limit(1)
					.executeTakeFirst()
					.then(
						(row) =>
							Number(
								(row as { gas_limit?: number | string } | undefined)
									?.gas_limit ?? 0,
							) || 0,
					)
					.catch(() => 0),
			])

			const symbolByAddress = new Map<string, string>()
			for (const entry of tokenListEntries) {
				symbolByAddress.set(entry.address.toLowerCase(), entry.symbol)
			}

			const txInfoByHash = new Map<
				string,
				{ input: string | null; to: string | null }
			>()
			const transferByHash = new Map<
				string,
				{ token: string; from: string; to: string; tokens: bigint }
			>()

			await Promise.all([
				// per-hash tx lookups
				...hashes.map(async (hash) => {
					try {
						const row = (await QB(chainId)
							.selectFrom('txs')
							.select(['input', 'to'])
							.where('hash', '=', hash)
							.limit(1)
							.executeTakeFirst()) as
							| { input: string | null; to: string | null }
							| undefined
						if (row) {
							txInfoByHash.set(hash.toLowerCase(), {
								input: row.input,
								to: row.to,
							})
						}
					} catch (error) {
						console.error('[landing] notable-tx hash lookup failed:', error)
					}
				}),
				// transfer events for these hashes — pick max(tokens) per tx
				(async () => {
					try {
						const transfers = (await QB(chainId)
							.withSignatures([
								'event Transfer(address indexed from, address indexed to, uint256 tokens)',
							])
							.selectFrom('transfer')
							.select(['tx_hash', 'address', 'from', 'to', 'tokens'])
							.where('tx_hash', 'in', hashes)
							.execute()) as unknown as Array<{
							tx_hash: string
							address: string
							from: string
							to: string
							tokens: string | number | bigint
						}>
						for (const t of transfers) {
							const key = t.tx_hash.toLowerCase()
							const tokens = (() => {
								try {
									return BigInt(t.tokens as never)
								} catch {
									return 0n
								}
							})()
							const existing = transferByHash.get(key)
							if (!existing || tokens > existing.tokens) {
								transferByHash.set(key, {
									token: String(t.address),
									from: String(t.from),
									to: String(t.to),
									tokens,
								})
							}
						}
					} catch (error) {
						console.error('[landing] notable-tx transfer lookup failed:', error)
					}
				})(),
			])

			const rows: LandingNotableTx[] = receipts.map((r) => {
				const key = r.tx_hash.toLowerCase()
				const tx = txInfoByHash.get(key)
				const transfer = transferByHash.get(key)

				let description: string
				let selector: Hex.Hex | null = null
				if (transfer) {
					const symbol =
						symbolByAddress.get(transfer.token.toLowerCase()) ??
						`${transfer.token.slice(0, 6)}…${transfer.token.slice(-4)}`
					const amount = formatTokenAmount(transfer.tokens)
					if (transfer.from === '0x0000000000000000000000000000000000000000') {
						description = `Mint ${amount} ${symbol}`
					} else if (
						transfer.to === '0x0000000000000000000000000000000000000000'
					) {
						description = `Burn ${amount} ${symbol}`
					} else {
						description = `Transfer ${amount} ${symbol}`
					}
				} else {
					const fallback = describeCall(tx?.to ?? r.to, tx?.input)
					description = fallback.description
					selector = fallback.selector
				}

				const gasUsed = (() => {
					try {
						return BigInt(String(r.gas_used ?? 0))
					} catch {
						return 0n
					}
				})()
				const gasPrice = (() => {
					try {
						return BigInt(String(r.effective_gas_price ?? 0))
					} catch {
						return 0n
					}
				})()
				const blockShare =
					latestBlockGasLimit > 0
						? Math.min(1, Number(gasUsed) / latestBlockGasLimit)
						: 0

				return {
					hash: r.tx_hash as Hex.Hex,
					from: r.from as Address.Address,
					to: (tx?.to ?? r.to) as Address.Address | null,
					gas_used: gasUsed.toString(),
					gas_price: gasPrice.toString(),
					gwei: gweiFromBigint(gasPrice),
					blockShare,
					block_timestamp: parseTimestamp(r.block_timestamp) ?? 0,
					selector,
					description,
				}
			})

			return { rows }
		} catch (error) {
			console.error('[landing] notable tx query failed:', error)
			return { rows: [] }
		}
	})
