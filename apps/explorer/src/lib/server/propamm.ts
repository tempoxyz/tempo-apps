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
	type PropAmmTrade,
	type PropAmmTradesSnapshot,
	poolKey,
	propAmmPoolsFor,
	tradeTotals,
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

/** Trades read per indexer query; the pools trade a few hundred times a month. */
const TRADES_PAGE = 5_000

/** Pages read before volume is reported unknown rather than understated. */
const MAX_TRADE_PAGES = 20

/** Recent trades sent to the page; volume counts every trade read. */
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
	type Parsed = Omit<PoolMeta, 'base' | 'quote'> & {
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
			(['symbol', 'decimals'] as const).map((functionName) => ({
				address,
				abi: Abis.tip20,
				functionName,
			})),
		),
	)
	const tokens = new Map<Address, DexPoolToken>()
	addresses.forEach((address, index) => {
		const [symbol, decimals] = tokenResults.slice(index * 2, index * 2 + 2)
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
		return base && quote ? [{ ...pool, base, quote }] : []
	})
	return { pools, complete: pools.length === configs.length }
}

function readMeta(chainId: number): Promise<MetaSnapshot> {
	const configs = propAmmPoolsFor(chainId)
	return withImmutableDataCache({
		key: `propamm-meta:v1:${chainId}`,
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
		let bidsOff = false
		let asksOff = false
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
			bidsOff = word.bidsOff
			asksOff = word.asksOff
			state =
				pair === undefined || hotWord === undefined || halted === undefined
					? 'unknown'
					: v2State({ halted, access: Number(pair.access), ...word, now })
		}

		const held =
			price === null || baseBalance === null ? null : baseBalance * price
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
			inventory:
				held === null || quoteBalance === null ? null : held + quoteBalance,
			// A side switched off takes no fills.
			maxBuy: asksOff ? 0 : held,
			maxSell: bidsOff ? 0 : quoteBalance,
		}
	})
	return { generatedAt, complete, pools }
}

type Raw = Record<string, unknown>

/** The listed pools' trades in the last 30 days, newest first. */
async function readTrades(
	chainId: number,
	pools: readonly PoolMeta[],
	since: number,
): Promise<PropAmmTrade[]> {
	if (pools.length === 0) return []
	const addresses = [...new Set(pools.map((pool) => pool.config.address))]
	// Every trade in the window is read, so volume is never cut short. Later
	// pages stop at the first page's newest block, so logs indexed meanwhile
	// can't shift them; ids still guard against repeats.
	const rows: Raw[] = []
	const seen = new Set<string>()
	let head: number | undefined
	for (let page = 0; ; page++) {
		if (page === MAX_TRADE_PAGES)
			throw new Error('Too many propAMM trades to total')
		const batch = await indexer(
			chainId,
			`SELECT tx_hash, log_idx, block_num, toUnixTimestamp(block_timestamp) AS ts,
				address, topic0, topic1, topic2, topic3, data FROM logs
			WHERE selector IN ('${tradeExecuted}', '${fill}')
				AND address IN (${list(addresses)})
				AND block_timestamp >= '${sqlTime(since * 1000)}'
				${head === undefined ? '' : `AND block_num <= ${head}`}
			ORDER BY block_num DESC, log_idx DESC
			LIMIT ${TRADES_PAGE} OFFSET ${page * TRADES_PAGE}`,
		)
		if (head === undefined && batch[0]) {
			const newest = Number(batch[0].block_num)
			if (Number.isSafeInteger(newest)) head = newest
		}
		for (const row of batch) {
			const id = `${row.tx_hash}-${row.log_idx}`
			if (seen.has(id)) continue
			seen.add(id)
			rows.push(row)
		}
		if (batch.length < TRADES_PAGE) break
	}
	return rows.flatMap((row) => {
		try {
			return toTrade(row, pools)
		} catch (error) {
			console.error('Failed to decode a propAMM trade:', error)
			return []
		}
	})
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
	]
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
	const trades = await readTrades(chainId, meta.pools, now - 30 * 86_400)
	return {
		generatedAt,
		totals: Object.fromEntries(tradeTotals(trades, now)),
		trades: trades.slice(0, SHOWN_TRADES),
	}
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
				key: `propamm-trades:v1:${getTempoChain().id}`,
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
