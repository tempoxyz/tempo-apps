import { createServerFn } from '@tanstack/react-start'
import {
	type Address,
	type ContractFunctionParameters,
	decodeEventLog,
	formatUnits,
	type Hex,
	parseAbi,
	toEventSelector,
} from 'viem'
import { Abis } from '#lib/abis'
import type { DexPoolToken } from '#lib/dex-pools'
import {
	decodeHotWord,
	type PropAmmPool,
	type PropAmmPoolConfig,
	type PropAmmSnapshot,
	type PropAmmTotals,
	type PropAmmTrade,
	type PropAmmTradesSnapshot,
	poolKey,
	propAmmPoolsFor,
	v1State,
	v2State,
} from '#lib/propamm'
import { addressOf, indexer, list, sqlTime } from '#lib/server/dex-indexer'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import { getBatchedClient, getTempoChain } from '#wagmi.config'

/** propAMM v1 DirectPropAMM (tempoxyz/propAMM contracts/src/DirectPropAMM.sol). */
const directAbi = parseAbi([
	'function baseToken() view returns (address)',
	'function quoteToken() view returns (address)',
	'function oracle() view returns (address)',
	'function oracleDecimals() view returns (uint8)',
	'function paused() view returns (bool)',
	'function maxOracleAge() view returns (uint80)',
	'event TradeExecuted(address indexed taker, address indexed recipient, bytes32 indexed customerId, bytes32 tradeId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 oraclePrice, uint256 oracleUpdatedAt)',
])

const oracleAbi = parseAbi([
	'function latestPrice() view returns (uint256 price, uint256 updatedAt)',
])

/** propAMM v2 Venue (tempoxyz/propAMM contracts/src/v2/interfaces/IVenue.sol). */
const venueAbi = parseAbi([
	'struct Pair { address base; address quote; uint64 sizeUnit; uint8 access; address hook; uint8 hookFlags; }',
	'function pair(uint16 pairIndex) view returns (Pair)',
	'function hotWord(uint16 pairIndex) view returns (bytes32)',
	'function halted() view returns (bool)',
	'event Fill(uint16 indexed pairIndex, address indexed taker, bytes32 indexed ref, uint64 sponsorId, bool baseIn, uint128 amountIn, uint128 amountOut, uint96 makerMid, uint32 seq)',
])

const tradeExecuted = toEventSelector(
	'TradeExecuted(address,address,bytes32,bytes32,address,address,uint256,uint256,uint256,uint256)',
)
const fill = toEventSelector(
	'Fill(uint16,address,bytes32,uint64,bool,uint128,uint128,uint96,uint32)',
)

/**
 * Each read has its own deadline, so one slow source only blanks its own
 * part of the page. Pool details that rarely change are cached for minutes,
 * so a live read is one batched RPC call.
 */
const META_DEADLINE = 2_500
const POOLS_DEADLINE = 2_500
const TRADES_DEADLINE = 5_000

/** Tokens, decimals and oracles: fixed at deployment, except a v1 oracle the owner can replace. */
const META_TTL = 600
const POOLS_TTL = 15
const TRADES_TTL = 30

/** Recent trades sent to the page; volume counts every trade. */
const SHOWN_TRADES = 100

/** The v2 mid is quote per base at 18 decimals. */
const MID_DECIMALS = 18

/** What a pool is: its tokens and, for v1, its oracle. */
type PoolMeta = {
	config: PropAmmPoolConfig
	key: string
	base: DexPoolToken
	quote: DexPoolToken
	/** v1 only. */
	oracle?: Address
	oracleDecimals?: number
	/** The side valued in US dollars: the quote when it is a USD token, else the base when that is; null when neither is. */
	usdSide: 'base' | 'quote' | null
}

type MetaSnapshot = { pools: PoolMeta[]; complete: boolean }

function withDeadline<T>(read: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	return Promise.race([
		read,
		new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error('PropAMM request timed out.')),
				ms,
			)
		}),
	]).finally(() => clearTimeout(timer))
}

/** One batched call at the latest block; each call can fail on its own. */
async function multicall(contracts: ContractFunctionParameters[]) {
	if (contracts.length === 0) return []
	return getBatchedClient().multicall({
		contracts,
		allowFailure: true,
		deployless: true,
	})
}

async function loadMeta(
	configs: readonly PropAmmPoolConfig[],
): Promise<MetaSnapshot> {
	const structure = await multicall(
		configs.flatMap((config): ContractFunctionParameters[] =>
			config.version === 'v1'
				? (
						['baseToken', 'quoteToken', 'oracle', 'oracleDecimals'] as const
					).map((functionName) => ({
						address: config.address,
						abi: directAbi,
						functionName,
					}))
				: [
						{
							address: config.address,
							abi: venueAbi,
							functionName: 'pair',
							args: [config.pairIndex],
						},
					],
		),
	)
	type Parsed = Omit<PoolMeta, 'base' | 'quote' | 'usdSide'> & {
		base: Address
		quote: Address
	}
	const parsed: Parsed[] = []
	let offset = 0
	for (const config of configs) {
		const size = config.version === 'v1' ? 4 : 1
		const slice = structure.slice(offset, offset + size)
		offset += size
		if (slice.some((result) => result.status !== 'success')) {
			console.error(`Failed to read propAMM pool ${config.address}`)
			continue
		}
		const values = slice.map((result) => result.result) as unknown[]
		const lower = (value: unknown) => String(value).toLowerCase() as Address
		if (config.version === 'v1') {
			const [base, quote, oracle, oracleDecimals] = values
			parsed.push({
				config,
				key: poolKey(config),
				base: lower(base),
				quote: lower(quote),
				oracle: lower(oracle),
				oracleDecimals: Number(oracleDecimals),
			})
		} else {
			const pair = values[0] as { base: Address; quote: Address }
			parsed.push({
				config,
				key: poolKey(config),
				base: lower(pair.base),
				quote: lower(pair.quote),
			})
		}
	}

	const addresses = [
		...new Set(parsed.flatMap((pool) => [pool.base, pool.quote])),
	]
	const tokenResults = await multicall(
		addresses.flatMap((address) =>
			(['symbol', 'decimals', 'currency'] as const).map((functionName) => ({
				address,
				abi: Abis.tip20,
				functionName,
			})),
		),
	)
	const tokens = new Map<Address, DexPoolToken>()
	const usd = new Set<Address>()
	addresses.forEach((address, index) => {
		const [symbol, decimals, currency] = tokenResults.slice(
			index * 3,
			index * 3 + 3,
		)
		if (currency?.status === 'success' && currency.result === 'USD')
			usd.add(address)
		if (symbol?.status !== 'success' || decimals?.status !== 'success') return
		tokens.set(address, {
			address,
			symbol: String(symbol.result),
			decimals: Number(decimals.result),
			// Listed by hand, so every pool's tokens are known ones.
			verified: true,
		})
	})

	const pools = parsed.flatMap((pool): PoolMeta[] => {
		const base = tokens.get(pool.base)
		const quote = tokens.get(pool.quote)
		const usdSide = usd.has(pool.quote)
			? 'quote'
			: usd.has(pool.base)
				? 'base'
				: null
		return base && quote ? [{ ...pool, base, quote, usdSide }] : []
	})
	return { pools, complete: pools.length === configs.length }
}

function readMeta(chainId: number): Promise<MetaSnapshot> {
	const configs = propAmmPoolsFor(chainId)
	return withImmutableDataCache({
		key: `propamm-meta:v2:${chainId}`,
		ttlSeconds: META_TTL,
		load: () => withDeadline(loadMeta(configs), META_DEADLINE),
		shouldCache: (meta) => meta.complete,
	})
}

export async function getPropAmmPools(): Promise<PropAmmSnapshot> {
	const chainId = getTempoChain().id
	const generatedAt = Date.now()
	const now = Math.floor(generatedAt / 1000)
	if (propAmmPoolsFor(chainId).length === 0)
		return { generatedAt, complete: true, pools: [] }

	const meta = await readMeta(chainId)
	// State, prices and balances in one call.
	const calls = meta.pools.map((pool): ContractFunctionParameters[] => {
		const { address, pairIndex } = pool.config
		const balances = [pool.base, pool.quote].map((token) => ({
			address: token.address,
			abi: Abis.tip20,
			functionName: 'balanceOf',
			args: [address],
		}))
		const state: ContractFunctionParameters[] =
			pool.config.version === 'v1'
				? [
						{ address, abi: directAbi, functionName: 'paused' },
						{ address, abi: directAbi, functionName: 'maxOracleAge' },
						{
							address: pool.oracle as Address,
							abi: oracleAbi,
							functionName: 'latestPrice',
						},
					]
				: [
						{ address, abi: venueAbi, functionName: 'pair', args: [pairIndex] },
						{
							address,
							abi: venueAbi,
							functionName: 'hotWord',
							args: [pairIndex],
						},
						{ address, abi: venueAbi, functionName: 'halted' },
					]
		return [...balances, ...state]
	})
	const results = await multicall(calls.flat())

	let complete = meta.complete
	let offset = 0
	const pools = meta.pools.map((pool, index): PropAmmPool => {
		const slice = results.slice(offset, offset + calls[index].length)
		offset += calls[index].length
		const value = (i: number) =>
			slice[i]?.status === 'success' ? slice[i].result : undefined
		const [baseRaw, quoteRaw] = [value(0), value(1)] as (bigint | undefined)[]
		// A failed read is unknown, not an empty pool.
		const baseBalance =
			baseRaw === undefined
				? null
				: Number(formatUnits(baseRaw, pool.base.decimals))
		const quoteBalance =
			quoteRaw === undefined
				? null
				: Number(formatUnits(quoteRaw, pool.quote.decimals))
		if (baseBalance === null || quoteBalance === null) complete = false

		let price: number | null = null
		let state: PropAmmPool['state']
		if (pool.config.version === 'v1') {
			const paused = value(2) as boolean | undefined
			const maxOracleAge = value(3) as bigint | number | undefined
			const latest = value(4) as readonly [bigint, bigint] | undefined
			if (latest && latest[0] > 0n)
				price = Number(formatUnits(latest[0], pool.oracleDecimals ?? 0))
			state =
				paused === undefined
					? 'unknown'
					: v1State({
							paused,
							priceAt: latest ? Number(latest[1]) : null,
							maxOracleAge:
								maxOracleAge === undefined ? null : Number(maxOracleAge),
							now,
						})
		} else {
			const pair = value(2) as { access: number } | undefined
			const hotWord = value(3) as Hex | undefined
			const halted = value(4) as boolean | undefined
			const word = decodeHotWord(hotWord ? BigInt(hotWord) : 0n)
			if (word.mid > 0n) price = Number(formatUnits(word.mid, MID_DECIMALS))
			state =
				pair === undefined || hotWord === undefined || halted === undefined
					? 'unknown'
					: v2State({ halted, access: Number(pair.access), ...word, now })
		}

		const held =
			price === null || baseBalance === null ? null : baseBalance * price
		// Dollars per quote token: 1 for a USD quote, else through the price
		// when the base is the USD side.
		const quoteUsd =
			pool.usdSide === 'quote'
				? 1
				: pool.usdSide === 'base' && price
					? 1 / price
					: null
		const baseValue =
			held === null || quoteUsd === null ? null : held * quoteUsd
		const quoteValue =
			quoteBalance === null || quoteUsd === null
				? null
				: quoteBalance * quoteUsd
		return {
			key: pool.key,
			version: pool.config.version,
			address: pool.config.address,
			pairIndex: pool.config.pairIndex,
			base: pool.base,
			quote: pool.quote,
			price,
			state,
			baseBalance,
			quoteBalance,
			baseValue,
			quoteValue,
			inventory:
				baseValue === null || quoteValue === null
					? null
					: baseValue + quoteValue,
		}
	})
	return { generatedAt, complete, pools }
}

type Raw = Record<string, unknown>

const fillSignature =
	'Fill(uint16 indexed pairIndex, address indexed taker, bytes32 indexed ref, uint64 sponsorId, bool baseIn, uint128 amountIn, uint128 amountOut, uint96 makerMid, uint32 seq)'
const tradeExecutedSignature =
	'TradeExecuted(address indexed taker, address indexed recipient, bytes32 indexed customerId, bytes32 tradeId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 oraclePrice, uint256 oracleUpdatedAt)'

/** Sums the indexer adds up, as strings so large raw amounts stay exact. */
function sums(day: string): string {
	return [
		'count() AS n',
		`countIf(block_timestamp >= '${day}') AS n_day`,
		'toString(sum("amountIn")) AS in_month',
		'toString(sum("amountOut")) AS out_month',
		`toString(sumIf("amountIn", block_timestamp >= '${day}')) AS in_day`,
		`toString(sumIf("amountOut", block_timestamp >= '${day}')) AS out_day`,
		'max(toUnixTimestamp(block_timestamp)) AS last',
	].join(', ')
}

function amount(value: unknown, decimals: number): number {
	try {
		return Number(formatUnits(BigInt(String(value ?? '0')), decimals))
	} catch {
		return 0
	}
}

/**
 * Each pool's 1D and 30D volume and trade count, summed by the indexer: the
 * testnet pools fill hundreds of thousands of times a month, too many to page.
 */
async function readTotals(
	chainId: number,
	pools: readonly PoolMeta[],
	now: number,
): Promise<Map<string, PropAmmTotals>> {
	const month = sqlTime((now - 30 * 86_400) * 1000)
	const day = sqlTime((now - 86_400) * 1000)
	const v1 = pools.filter((pool) => pool.config.version === 'v1')
	const v2 = pools.filter((pool) => pool.config.version === 'v2')
	const [v1Rows, v2Rows] = await Promise.all([
		v1.length === 0
			? []
			: indexer(
					chainId,
					`SELECT address, "tokenIn" AS token_in, ${sums(day)}
					FROM tradeexecuted
					WHERE address IN (${list(new Set(v1.map((pool) => pool.config.address)))})
						AND block_timestamp >= '${month}'
					GROUP BY address, token_in`,
					tradeExecutedSignature,
				),
		v2.length === 0
			? []
			: indexer(
					chainId,
					`SELECT address, "pairIndex" AS pair, "baseIn" AS base_in, ${sums(day)}
					FROM fill
					WHERE address IN (${list(new Set(v2.map((pool) => pool.config.address)))})
						AND block_timestamp >= '${month}'
					GROUP BY address, pair, base_in`,
					fillSignature,
				),
	])

	const totals = new Map<string, PropAmmTotals>()
	const add = (pool: PoolMeta, row: Raw, baseIn: boolean) => {
		const total = totals.get(pool.key) ?? {
			volume: { day: 0, month: 0 },
			trades: { day: 0, month: 0 },
			lastTradeAt: null,
		}
		// The USD side's amount values the trade; volume in neither is left out.
		if (pool.usdSide) {
			const quoteSide = baseIn ? 'out' : 'in'
			const side =
				pool.usdSide === 'quote' ? quoteSide : quoteSide === 'in' ? 'out' : 'in'
			const token = pool.usdSide === 'quote' ? pool.quote : pool.base
			total.volume.month += amount(row[`${side}_month`], token.decimals)
			total.volume.day += amount(row[`${side}_day`], token.decimals)
		}
		total.trades.month += Number(row.n) || 0
		total.trades.day += Number(row.n_day) || 0
		const last = Number(row.last)
		if (Number.isFinite(last) && last > 0)
			total.lastTradeAt = Math.max(total.lastTradeAt ?? 0, last)
		totals.set(pool.key, total)
	}
	for (const row of v1Rows) {
		const address = addressOf(row.address)
		const pool = v1.find((pool) => pool.config.address === address)
		if (pool) add(pool, row, addressOf(row.token_in) === pool.base.address)
	}
	for (const row of v2Rows) {
		const address = addressOf(row.address)
		const pair = Number(row.pair)
		const pool = v2.find(
			(pool) =>
				pool.config.address === address && pool.config.pairIndex === pair,
		)
		if (pool) add(pool, row, Number(row.base_in) === 1 || row.base_in === true)
	}
	return totals
}

/** The listed pools' latest trades in the last 30 days, newest first. */
async function readTrades(
	chainId: number,
	pools: readonly PoolMeta[],
	since: number,
): Promise<PropAmmTrade[]> {
	if (pools.length === 0) return []
	const addresses = [...new Set(pools.map((pool) => pool.config.address))]
	// A venue can list pairs that aren't shown, so read a margin past the
	// trades shown before filtering them out.
	const rows = await indexer(
		chainId,
		`SELECT tx_hash, log_idx, block_num, toUnixTimestamp(block_timestamp) AS ts,
			address, topic0, topic1, topic2, topic3, data FROM logs
		WHERE selector IN ('${tradeExecuted}', '${fill}')
			AND address IN (${list(addresses)})
			AND block_timestamp >= '${sqlTime(since * 1000)}'
		ORDER BY block_num DESC, log_idx DESC
		LIMIT ${SHOWN_TRADES * 5}`,
	)
	return rows
		.flatMap((row) => {
			try {
				return toTrade(row, pools)
			} catch (error) {
				console.error('Failed to decode a propAMM trade:', error)
				return []
			}
		})
		.slice(0, SHOWN_TRADES)
}

function toTrade(row: Raw, pools: readonly PoolMeta[]): PropAmmTrade[] {
	const address = addressOf(row.address)
	const topics = [row.topic0, row.topic1, row.topic2, row.topic3]
		.map((topic) => (topic ? String(topic) : ''))
		.filter((topic) => /^0x[0-9a-f]{64}$/i.test(topic)) as [Hex, ...Hex[]]
	const data = String(row.data ?? '0x') as Hex
	const selector = topics[0]?.toLowerCase()
	let pool: PoolMeta | undefined
	let trade: { taker: Address; baseIn: boolean; in: bigint; out: bigint }
	if (selector === tradeExecuted) {
		pool = pools.find(
			(pool) => pool.config.version === 'v1' && pool.config.address === address,
		)
		if (!pool) return []
		const { args } = decodeEventLog({ abi: directAbi, topics, data })
		trade = {
			taker: args.taker,
			baseIn: args.tokenIn.toLowerCase() === pool.base.address,
			in: args.amountIn,
			out: args.amountOut,
		}
	} else if (selector === fill) {
		const { args } = decodeEventLog({ abi: venueAbi, topics, data })
		pool = pools.find(
			(pool) =>
				pool.config.version === 'v2' &&
				pool.config.address === address &&
				pool.config.pairIndex === args.pairIndex,
		)
		if (!pool) return []
		trade = {
			taker: args.taker,
			baseIn: args.baseIn,
			in: args.amountIn,
			out: args.amountOut,
		}
	} else return []
	return [
		{
			id: `${row.tx_hash}-${row.log_idx}`,
			poolKey: pool.key,
			transactionHash: String(row.tx_hash) as Hex,
			timestamp: Number(row.ts),
			taker: trade.taker.toLowerCase() as Address,
			baseIn: trade.baseIn,
			baseAmount: Number(
				formatUnits(trade.baseIn ? trade.in : trade.out, pool.base.decimals),
			),
			quoteAmount: Number(
				formatUnits(trade.baseIn ? trade.out : trade.in, pool.quote.decimals),
			),
		},
	].map((trade) => ({
		...trade,
		value:
			pool.usdSide === 'quote'
				? trade.quoteAmount
				: pool.usdSide === 'base'
					? trade.baseAmount
					: null,
	}))
}

export async function getPropAmmTrades(): Promise<PropAmmTradesSnapshot> {
	const chainId = getTempoChain().id
	const generatedAt = Date.now()
	const now = Math.floor(generatedAt / 1000)
	if (propAmmPoolsFor(chainId).length === 0)
		return { generatedAt, totals: {}, trades: [] }
	const meta = await readMeta(chainId)
	// Totals from a partial pool list would read as zero volume.
	if (!meta.complete) throw new Error('Some propAMM pools could not be read')
	const [totals, trades] = await Promise.all([
		readTotals(chainId, meta.pools, now),
		readTrades(chainId, meta.pools, now - 30 * 86_400),
	])
	return { generatedAt, totals: Object.fromEntries(totals), trades }
}

export const fetchPropAmmPools = createServerFn({ method: 'GET' }).handler(
	async (): Promise<PropAmmSnapshot> => {
		try {
			return await withImmutableDataCache({
				key: `propamm-pools:v2:${getTempoChain().id}`,
				ttlSeconds: POOLS_TTL,
				load: () =>
					withDeadline(getPropAmmPools(), META_DEADLINE + POOLS_DEADLINE),
				shouldCache: (snapshot) =>
					snapshot.pools.length > 0 && snapshot.complete,
			})
		} catch (error) {
			console.error('Failed to load propAMM pools:', error)
			throw new Error(
				'PropAMM pools are temporarily unavailable. Please try again.',
			)
		}
	},
)

export const fetchPropAmmTrades = createServerFn({ method: 'GET' }).handler(
	async (): Promise<PropAmmTradesSnapshot> => {
		try {
			return await withImmutableDataCache({
				key: `propamm-trades:v2:${getTempoChain().id}`,
				ttlSeconds: TRADES_TTL,
				load: () =>
					withDeadline(getPropAmmTrades(), META_DEADLINE + TRADES_DEADLINE),
			})
		} catch (error) {
			console.error('Failed to load propAMM trades:', error)
			throw new Error(
				'PropAMM trades are temporarily unavailable. Please try again.',
			)
		}
	},
)
