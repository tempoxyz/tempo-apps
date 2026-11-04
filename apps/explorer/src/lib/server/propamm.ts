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
	poolKey,
	propAmmPoolsFor,
	tradeTotals,
	v1State,
	v2State,
} from '#lib/propamm'
import {
	addressOf,
	indexer,
	list,
	readContracts,
	readVerified,
	sqlTime,
} from '#lib/server/dex-indexer'
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

/** Trades read per indexer query; the pools trade a few hundred times a month. */
const TRADES_PAGE = 5_000

/** Pages read before volume is reported unknown rather than understated. */
const MAX_TRADE_PAGES = 20

/** Recent trades sent to the page; volume counts every trade read. */
const SHOWN_TRADES = 100

/** How long the page waits for the chain and the indexer. */
const DEADLINE = 15_000

/** The v2 mid is quote per base at 18 decimals. */
const MID_DECIMALS = 18

type Structure = {
	config: PropAmmPoolConfig
	base: Address
	quote: Address
	/** v1 only. */
	oracle?: Address
	oracleDecimals?: number
	paused?: boolean
	maxOracleAge?: number
	/** v2 only. */
	access?: number
	hotWord?: bigint
	halted?: boolean
}

/** Each pool's tokens and state; pools that can't be read are left out. */
async function readStructures(
	configs: readonly PropAmmPoolConfig[],
	blockNumber: bigint,
): Promise<Structure[]> {
	const calls: ContractFunctionParameters[] = configs.flatMap(
		(config): ContractFunctionParameters[] =>
			config.version === 'v1'
				? (
						[
							'baseToken',
							'quoteToken',
							'oracle',
							'oracleDecimals',
							'paused',
							'maxOracleAge',
						] as const
					).map((functionName) => ({
						address: config.address,
						abi: directAbi,
						functionName,
					}))
				: [
						{
							address: config.address,
							abi: venueAbi,
							functionName: 'pair' as const,
							args: [config.pairIndex] as const,
						},
						{
							address: config.address,
							abi: venueAbi,
							functionName: 'hotWord' as const,
							args: [config.pairIndex] as const,
						},
						{
							address: config.address,
							abi: venueAbi,
							functionName: 'halted' as const,
						},
					],
	)
	const results = await readContracts(calls, blockNumber)
	const structures: Structure[] = []
	let offset = 0
	for (const config of configs) {
		const size = config.version === 'v1' ? 6 : 3
		const slice = results.slice(offset, offset + size)
		offset += size
		if (slice.some((result) => result.status !== 'success')) {
			console.error(`Failed to read propAMM pool ${config.address}`)
			continue
		}
		const values = slice.map((result) => result.result) as unknown[]
		if (config.version === 'v1') {
			const [base, quote, oracle, oracleDecimals, paused, maxOracleAge] = values
			structures.push({
				config,
				base: String(base).toLowerCase() as Address,
				quote: String(quote).toLowerCase() as Address,
				oracle: String(oracle).toLowerCase() as Address,
				oracleDecimals: Number(oracleDecimals),
				paused: Boolean(paused),
				maxOracleAge: Number(maxOracleAge),
			})
		} else {
			const [pair, hotWord, halted] = values as [
				{ base: Address; quote: Address; access: number },
				Hex,
				boolean,
			]
			structures.push({
				config,
				base: pair.base.toLowerCase() as Address,
				quote: pair.quote.toLowerCase() as Address,
				access: Number(pair.access),
				hotWord: BigInt(hotWord),
				halted,
			})
		}
	}
	return structures
}

type Raw = Record<string, unknown>

/** The listed pools' trades in the last 30 days, newest first. */
async function readTrades(
	chainId: number,
	structures: readonly Structure[],
	tokens: Map<Address, DexPoolToken>,
	since: number,
): Promise<PropAmmTrade[]> {
	if (structures.length === 0) return []
	const addresses = [
		...new Set(structures.map((pool) => pool.config.address.toLowerCase())),
	]
	// Every trade in the window is read, so volume is never cut short.
	const rows: Raw[] = []
	for (let page = 0; ; page++) {
		if (page === MAX_TRADE_PAGES)
			throw new Error('Too many propAMM trades to total')
		const batch = await indexer(
			chainId,
			`SELECT tx_hash, log_idx, toUnixTimestamp(block_timestamp) AS ts, address,
				topic0, topic1, topic2, topic3, data FROM logs
			WHERE selector IN ('${tradeExecuted}', '${fill}')
				AND address IN (${list(addresses)})
				AND block_timestamp >= '${sqlTime(since * 1000)}'
			ORDER BY block_num DESC, log_idx DESC
			LIMIT ${TRADES_PAGE} OFFSET ${page * TRADES_PAGE}`,
		)
		rows.push(...batch)
		if (batch.length < TRADES_PAGE) break
	}
	return rows.flatMap((row) => {
		try {
			return toTrade(row, structures, tokens)
		} catch (error) {
			console.error('Failed to decode a propAMM trade:', error)
			return []
		}
	})
}

function toTrade(
	row: Raw,
	structures: readonly Structure[],
	tokens: Map<Address, DexPoolToken>,
): PropAmmTrade[] {
	const address = addressOf(row.address)
	const topics = [row.topic0, row.topic1, row.topic2, row.topic3]
		.map((topic) => (topic ? String(topic) : ''))
		.filter((topic) => /^0x[0-9a-f]{64}$/i.test(topic)) as [Hex, ...Hex[]]
	const data = String(row.data ?? '0x') as Hex
	const base = {
		id: `${row.tx_hash}-${row.log_idx}`,
		transactionHash: String(row.tx_hash) as Hex,
		timestamp: Number(row.ts),
	}
	if (topics[0]?.toLowerCase() === tradeExecuted) {
		const pool = structures.find(
			(pool) => pool.config.version === 'v1' && pool.config.address === address,
		)
		if (!pool) return []
		const { args } = decodeEventLog({ abi: directAbi, topics, data })
		const baseToken = tokens.get(pool.base)
		const quoteToken = tokens.get(pool.quote)
		if (!baseToken || !quoteToken) return []
		const baseIn = args.tokenIn.toLowerCase() === pool.base
		return [
			{
				...base,
				poolKey: poolKey(pool.config),
				taker: args.taker.toLowerCase() as Address,
				baseIn,
				baseAmount: Number(
					formatUnits(
						baseIn ? args.amountIn : args.amountOut,
						baseToken.decimals,
					),
				),
				quoteAmount: Number(
					formatUnits(
						baseIn ? args.amountOut : args.amountIn,
						quoteToken.decimals,
					),
				),
			},
		]
	}
	if (topics[0]?.toLowerCase() === fill) {
		const { args } = decodeEventLog({ abi: venueAbi, topics, data })
		const pool = structures.find(
			(pool) =>
				pool.config.version === 'v2' &&
				pool.config.address === address &&
				pool.config.pairIndex === args.pairIndex,
		)
		if (!pool) return []
		const baseToken = tokens.get(pool.base)
		const quoteToken = tokens.get(pool.quote)
		if (!baseToken || !quoteToken) return []
		return [
			{
				...base,
				poolKey: poolKey(pool.config),
				taker: args.taker.toLowerCase() as Address,
				baseIn: args.baseIn,
				baseAmount: Number(
					formatUnits(
						args.baseIn ? args.amountIn : args.amountOut,
						baseToken.decimals,
					),
				),
				quoteAmount: Number(
					formatUnits(
						args.baseIn ? args.amountOut : args.amountIn,
						quoteToken.decimals,
					),
				),
			},
		]
	}
	return []
}

export async function getPropAmmPools(): Promise<PropAmmSnapshot> {
	const chainId = getTempoChain().id
	const configs = propAmmPoolsFor(chainId)
	const generatedAt = Date.now()
	const now = Math.floor(generatedAt / 1000)
	if (configs.length === 0)
		return { generatedAt, complete: true, pools: [], trades: [] }

	const blockNumber = await getBatchedClient().getBlockNumber()
	const structures = await readStructures(configs, blockNumber)
	const tokenAddresses = [
		...new Set(structures.flatMap((pool) => [pool.base, pool.quote])),
	]
	const v1 = structures.filter((pool) => pool.oracle)

	const [tokenResults, balanceResults, priceResults, verified] =
		await Promise.all([
			readContracts(
				tokenAddresses.flatMap((address) =>
					(['symbol', 'decimals'] as const).map((functionName) => ({
						address,
						abi: Abis.tip20,
						functionName,
					})),
				),
				blockNumber,
			),
			readContracts(
				structures.flatMap((pool) =>
					[pool.base, pool.quote].map((token) => ({
						address: token,
						abi: Abis.tip20,
						functionName: 'balanceOf' as const,
						args: [pool.config.address] as const,
					})),
				),
				blockNumber,
			),
			readContracts(
				v1.map((pool) => ({
					address: pool.oracle as Address,
					abi: oracleAbi,
					functionName: 'latestPrice' as const,
				})),
				blockNumber,
			),
			readVerified(chainId),
		])

	const tokens = new Map<Address, DexPoolToken>()
	tokenAddresses.forEach((address, index) => {
		const [symbol, decimals] = tokenResults.slice(index * 2, index * 2 + 2)
		if (symbol?.status !== 'success' || decimals?.status !== 'success') return
		tokens.set(address, {
			address,
			symbol: String(symbol.result),
			decimals: Number(decimals.result),
			verified: verified.has(address),
		})
	})

	const trades = await readTrades(
		chainId,
		structures,
		tokens,
		now - 30 * 86_400,
	).catch((error) => {
		// Pools still show without volume when the indexer is down.
		console.error('Failed to read propAMM trades:', error)
		return null
	})
	const totals = trades ? tradeTotals(trades, now) : null

	let complete = true
	const pools = structures.flatMap((pool, index): PropAmmPool[] => {
		const base = tokens.get(pool.base)
		const quote = tokens.get(pool.quote)
		if (!base || !quote) return []
		const [baseRaw, quoteRaw] = balanceResults.slice(index * 2, index * 2 + 2)
		// A failed read is unknown, not an empty pool.
		const baseBalance =
			baseRaw?.status === 'success'
				? Number(formatUnits(baseRaw.result as bigint, base.decimals))
				: null
		const quoteBalance =
			quoteRaw?.status === 'success'
				? Number(formatUnits(quoteRaw.result as bigint, quote.decimals))
				: null
		if (baseBalance === null || quoteBalance === null) complete = false

		let price: number | null = null
		let state: PropAmmPool['state']
		if (pool.config.version === 'v1') {
			const result = priceResults[v1.indexOf(pool)]
			const latest =
				result?.status === 'success'
					? (result.result as readonly [bigint, bigint])
					: null
			if (latest && latest[0] > 0n)
				price = Number(formatUnits(latest[0], pool.oracleDecimals ?? 0))
			state = v1State({
				paused: Boolean(pool.paused),
				priceAt: latest ? Number(latest[1]) : null,
				maxOracleAge: pool.maxOracleAge ?? null,
				now,
			})
		} else {
			const word = decodeHotWord(pool.hotWord ?? 0n)
			if (word.mid > 0n) price = Number(formatUnits(word.mid, MID_DECIMALS))
			state = v2State({
				halted: Boolean(pool.halted),
				access: pool.access ?? 0,
				...word,
				now,
			})
		}

		const key = poolKey(pool.config)
		const total = totals?.get(key)
		const held =
			price === null || baseBalance === null ? null : baseBalance * price
		const word =
			pool.config.version === 'v2' ? decodeHotWord(pool.hotWord ?? 0n) : null
		// A side the maker switched off takes no fills.
		const maxBuy = word?.asksOff ? 0 : held
		return [
			{
				key,
				version: pool.config.version,
				address: pool.config.address,
				pairIndex: pool.config.pairIndex,
				maker: pool.config.maker,
				base,
				quote,
				price,
				state,
				baseBalance,
				quoteBalance,
				inventory:
					held === null || quoteBalance === null ? null : held + quoteBalance,
				maxBuy,
				maxSell: word?.bidsOff ? 0 : quoteBalance,
				volume: totals ? (total?.volume ?? { day: 0, month: 0 }) : null,
				trades: totals ? (total?.trades ?? { day: 0, month: 0 }) : null,
				lastTradeAt: total?.lastTradeAt ?? null,
			},
		]
	})

	return {
		generatedAt,
		complete,
		pools,
		trades:
			trades
				?.filter((trade) => pools.some((pool) => pool.key === trade.poolKey))
				.slice(0, SHOWN_TRADES) ?? null,
	}
}

async function withDeadline<T>(read: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			read,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error('PropAMM request timed out.')),
					DEADLINE,
				)
			}),
		])
	} finally {
		clearTimeout(timer)
	}
}

export const fetchPropAmmPools = createServerFn({ method: 'GET' }).handler(
	async (): Promise<PropAmmSnapshot> => {
		try {
			return await withImmutableDataCache({
				key: `propamm-pools:v1:${getTempoChain().id}`,
				ttlSeconds: 30,
				load: () => withDeadline(getPropAmmPools()),
				// A snapshot without trades would show unknown volume for the whole TTL.
				shouldCache: (snapshot) =>
					snapshot.pools.length > 0 &&
					snapshot.complete &&
					snapshot.trades !== null,
			})
		} catch (error) {
			console.error('Failed to load propAMM pools:', error)
			throw new Error(
				'PropAMM pools are temporarily unavailable. Please try again.',
			)
		}
	},
)
