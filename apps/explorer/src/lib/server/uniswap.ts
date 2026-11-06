import { createServerFn } from '@tanstack/react-start'
import {
	type Address,
	type ContractFunctionParameters,
	concat,
	decodeEventLog,
	formatUnits,
	type Hex,
	keccak256,
	pad,
	parseAbi,
	toHex,
} from 'viem'
import { Abis } from '#lib/abis'
import type { DexPoolToken } from '#lib/dex-pools'
import { addressOf, indexer, list, sqlTime } from '#lib/server/dex-indexer'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import {
	baseIsCurrency0,
	decodeSlot0,
	type LiquidityRange,
	poolManagers,
	poolReserves,
	price1Per0,
	type UniswapPool,
	type UniswapPoolConfig,
	type UniswapSnapshot,
	type UniswapState,
	type UniswapTrade,
	uniswapPoolsFor,
} from '#lib/uniswap'
import { getBatchedClient, getTempoChain } from '#wagmi.config'

/** v4-core PoolManager: its storage and events. */
const poolManagerAbi = parseAbi([
	'function extsload(bytes32 slot) view returns (bytes32)',
	'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
])

const swapSignature =
	'Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)'
const modifyLiquiditySignature =
	'ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)'

/** The PoolManager's pools mapping (v4-core StateLibrary.POOLS_SLOT). */
const POOLS_SLOT = pad(toHex(6))

const META_DEADLINE = 2_500
/** Positions and volume: shorter than the pools' budget, so a slow indexer only blanks them. */
const INDEXER_DEADLINE = 3_500
const POOLS_DEADLINE = 5_000
const TRADES_DEADLINE = 5_000
const META_TTL = 600
const POOLS_TTL = 15
const TRADES_TTL = 30
const SHOWN_TRADES = 100
/** In US dollars: the smallest swap the list shows. */
const MIN_TRADE_VALUE = 1n

type PoolMeta = {
	config: UniswapPoolConfig
	base: DexPoolToken
	quote: DexPoolToken
	baseIs0: boolean
	usdSide: 'base' | 'quote' | null
}

type MetaSnapshot = { pools: PoolMeta[]; complete: boolean }

type Raw = Record<string, unknown>

function withDeadline<T>(read: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	return Promise.race([
		read,
		new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error('Uniswap request timed out.')),
				ms,
			)
		}),
	]).finally(() => clearTimeout(timer))
}

async function multicall(contracts: ContractFunctionParameters[]) {
	if (contracts.length === 0) return []
	return getBatchedClient().multicall({
		contracts,
		allowFailure: true,
		deployless: true,
	})
}

/** Tokens and each pool's orientation: fixed once the pool exists. */
async function loadMeta(
	configs: readonly UniswapPoolConfig[],
): Promise<MetaSnapshot> {
	const addresses = [
		...new Set(configs.flatMap((pool) => [pool.currency0, pool.currency1])),
	]
	const fields = ['symbol', 'decimals', 'currency', 'quoteToken'] as const
	const results = await multicall(
		addresses.flatMap((address) =>
			fields.map((functionName) => ({
				address,
				abi: Abis.tip20,
				functionName,
			})),
		),
	)
	const tokens = new Map<
		Address,
		{ token: DexPoolToken; usd: boolean; quoteToken: Address | null }
	>()
	addresses.forEach((address, index) => {
		const [symbol, decimals, currency, quoteToken] = results.slice(
			index * fields.length,
			(index + 1) * fields.length,
		)
		if (
			symbol?.status !== 'success' ||
			decimals?.status !== 'success' ||
			currency?.status !== 'success'
		)
			return
		tokens.set(address, {
			token: {
				address,
				symbol: String(symbol.result),
				decimals: Number(decimals.result),
				// Listed by hand, so every pool's tokens are known ones.
				verified: true,
			},
			usd: currency.result === 'USD',
			quoteToken:
				quoteToken?.status === 'success'
					? (addressOf(quoteToken.result) ?? null)
					: null,
		})
	})
	const pools = configs.flatMap((config): PoolMeta[] => {
		const token0 = tokens.get(config.currency0)
		const token1 = tokens.get(config.currency1)
		if (!token0 || !token1) return []
		const baseIs0 = baseIsCurrency0({
			usd0: token0.usd,
			usd1: token1.usd,
			quoteOf0: token0.quoteToken,
			quoteOf1: token1.quoteToken,
			currency0: config.currency0,
			currency1: config.currency1,
		})
		const [base, quote] = baseIs0 ? [token0, token1] : [token1, token0]
		return [
			{
				config,
				base: base.token,
				quote: quote.token,
				baseIs0,
				usdSide: quote.usd ? 'quote' : base.usd ? 'base' : null,
			},
		]
	})
	return { pools, complete: pools.length === configs.length }
}

function readMeta(chainId: number): Promise<MetaSnapshot> {
	return withImmutableDataCache({
		key: `uniswap-meta:v1:${chainId}`,
		ttlSeconds: META_TTL,
		load: () => withDeadline(loadMeta(uniswapPoolsFor(chainId)), META_DEADLINE),
		shouldCache: (meta) => meta.complete,
	})
}

/** Open liquidity by range, from every ModifyLiquidity of the listed pools. */
async function readRanges(
	chainId: number,
	manager: Address,
	ids: readonly Hex[],
): Promise<Map<Hex, LiquidityRange[]>> {
	const rows = await indexer(
		chainId,
		`SELECT id, "tickLower" AS lower, "tickUpper" AS upper,
			toString(sum("liquidityDelta")) AS liquidity
		FROM modifyliquidity
		WHERE address = '${manager}' AND id IN (${list(ids)})
		GROUP BY id, lower, upper
		HAVING sum("liquidityDelta") != 0`,
		modifyLiquiditySignature,
	)
	const ranges = new Map<Hex, LiquidityRange[]>(ids.map((id) => [id, []]))
	for (const row of rows) {
		const id = String(row.id).toLowerCase() as Hex
		try {
			ranges.get(id)?.push({
				tickLower: Number(row.lower),
				tickUpper: Number(row.upper),
				liquidity: BigInt(String(row.liquidity)),
			})
		} catch {}
	}
	return ranges
}

/** Each pool's raw swap amounts over 1D and 30D, both sides. */
async function readVolume(
	chainId: number,
	manager: Address,
	ids: readonly Hex[],
	now: number,
): Promise<Map<Hex, Raw>> {
	const month = sqlTime((now - 30 * 86_400) * 1000)
	const day = sqlTime((now - 86_400) * 1000)
	const rows = await indexer(
		chainId,
		`SELECT id,
			toString(sum(abs("amount0"))) AS a0_month,
			toString(sum(abs("amount1"))) AS a1_month,
			toString(sumIf(abs("amount0"), block_timestamp >= '${day}')) AS a0_day,
			toString(sumIf(abs("amount1"), block_timestamp >= '${day}')) AS a1_day
		FROM swap
		WHERE address = '${manager}' AND id IN (${list(ids)})
			AND block_timestamp >= '${month}'
		GROUP BY id`,
		swapSignature,
	)
	return new Map(rows.map((row) => [String(row.id).toLowerCase() as Hex, row]))
}

function units(value: unknown, decimals: number): number {
	try {
		return Number(formatUnits(BigInt(String(value ?? '0')), decimals))
	} catch {
		return 0
	}
}

/** Dollars per quote token: 1 for a USD quote, else through the price. */
function quoteUsd(pool: PoolMeta, price: number | null): number | null {
	if (pool.usdSide === 'quote') return 1
	if (pool.usdSide === 'base' && price) return 1 / price
	return null
}

export async function getUniswapPools(): Promise<UniswapSnapshot> {
	const chainId = getTempoChain().id
	const generatedAt = Date.now()
	const manager = poolManagers[chainId]
	if (!manager || uniswapPoolsFor(chainId).length === 0)
		return { generatedAt, complete: true, pools: [] }

	const meta = await readMeta(chainId)
	const ids = meta.pools.map((pool) => pool.config.id)
	if (ids.length === 0) throw new Error('No Uniswap pool could be read')
	// Positions and volume come from the indexer; each can fail on its own.
	const [slots, ranges, volume] = await Promise.all([
		multicall(
			ids.map((id) => ({
				address: manager,
				abi: poolManagerAbi,
				functionName: 'extsload',
				args: [keccak256(concat([id, POOLS_SLOT]))],
			})),
		),
		withDeadline(readRanges(chainId, manager, ids), INDEXER_DEADLINE).catch(
			(error) => {
				console.error('Failed to read Uniswap positions:', error)
				return null
			},
		),
		withDeadline(
			readVolume(chainId, manager, ids, Math.floor(generatedAt / 1000)),
			INDEXER_DEADLINE,
		).catch((error) => {
			console.error('Failed to read Uniswap volume:', error)
			return null
		}),
	])

	let complete = meta.complete && ranges !== null && volume !== null
	const pools = meta.pools.map((pool, index): UniswapPool => {
		const { base, quote, baseIs0, config } = pool
		const slot = slots[index]
		const slot0 =
			slot?.status === 'success'
				? decodeSlot0(BigInt(slot.result as Hex))
				: null
		if (!slot0) complete = false
		const [token0, token1] = baseIs0 ? [base, quote] : [quote, base]

		let price: number | null = null
		if (slot0 && slot0.sqrtPriceX96 > 0n) {
			const p = price1Per0(slot0.sqrtPriceX96, token0.decimals, token1.decimals)
			price = baseIs0 ? p : 1 / p
			if (!Number.isFinite(price) || price <= 0) price = null
		}

		const poolRanges = ranges?.get(config.id)
		let state: UniswapState = 'unknown'
		let baseValue: number | null = null
		let quoteValue: number | null = null
		if (slot0 && poolRanges) {
			const held = poolReserves(poolRanges, slot0.sqrtPriceX96, slot0.tick)
			state =
				poolRanges.length === 0
					? 'empty'
					: held.active > 0
						? 'live'
						: 'out_of_range'
			const amount0 = held.amount0 / 10 ** token0.decimals
			const amount1 = held.amount1 / 10 ** token1.decimals
			const [baseAmount, quoteAmount] = baseIs0
				? [amount0, amount1]
				: [amount1, amount0]
			const usd = quoteUsd(pool, price)
			if (usd !== null && price !== null) {
				baseValue = baseAmount * price * usd
				quoteValue = quoteAmount * usd
			}
		}

		let poolVolume: UniswapPool['volume'] = null
		if (volume) {
			const row = volume.get(config.id)
			// The USD side's amount values a swap; volume in neither is left out.
			const side =
				pool.usdSide === null ? null : pool.usdSide === 'base' ? base : quote
			const column = side === null ? null : side === token0 ? 'a0' : 'a1'
			poolVolume =
				column && side
					? {
							day: units(row?.[`${column}_day`], side.decimals),
							month: units(row?.[`${column}_month`], side.decimals),
						}
					: { day: 0, month: 0 }
		}

		return {
			key: config.id,
			manager,
			base,
			quote,
			fee: config.fee,
			price,
			state,
			baseValue,
			quoteValue,
			reserves:
				baseValue === null || quoteValue === null
					? null
					: baseValue + quoteValue,
			volume: poolVolume,
		}
	})
	return { generatedAt, complete, pools }
}

/** The listed pools' latest swaps in the last 30 days, newest first. */
export async function getUniswapTrades(): Promise<UniswapTrade[]> {
	const chainId = getTempoChain().id
	const manager = poolManagers[chainId]
	if (!manager || uniswapPoolsFor(chainId).length === 0) return []
	const meta = await readMeta(chainId)
	// Trades from a partial pool list would drop those pools' swaps, and be cached.
	if (!meta.complete) throw new Error('Some Uniswap pools could not be read')
	const since = Math.floor(Date.now() / 1000) - 30 * 86_400
	// Swaps worth under a dollar are left out: a bot's dust swaps would
	// otherwise fill the list.
	const matches = meta.pools.map((pool) => {
		const side =
			pool.usdSide === null
				? null
				: pool.usdSide === 'base'
					? pool.base
					: pool.quote
		const column =
			side === null
				? null
				: (side === pool.base) === pool.baseIs0
					? 'amount0'
					: 'amount1'
		return column && side
			? `(id = '${pool.config.id}' AND abs("${column}") >= ${10n ** BigInt(side.decimals) * MIN_TRADE_VALUE})`
			: `id = '${pool.config.id}'`
	})
	const rows = await indexer(
		chainId,
		`SELECT tx_hash, log_idx, block_num, toUnixTimestamp(block_timestamp) AS ts,
			selector AS topic0, topic1, topic2, data FROM swap
		WHERE address = '${manager}' AND (${matches.join(' OR ')})
			AND block_timestamp >= '${sqlTime(since * 1000)}'
		ORDER BY block_num DESC, log_idx DESC
		LIMIT ${SHOWN_TRADES}`,
		swapSignature,
	)
	if (rows.length === 0) return []

	// A swap's sender is the router, so the taker is the transaction's sender.
	const hashes = [
		...new Set(
			rows
				.map((row) => String(row.tx_hash).toLowerCase())
				.filter((hash) => /^0x[0-9a-f]{64}$/.test(hash)),
		),
	]
	const firstBlock = Math.min(...rows.map((row) => Number(row.block_num)))
	const senders = new Map<string, Address>()
	if (hashes.length > 0 && Number.isFinite(firstBlock)) {
		const txs = await indexer(
			chainId,
			`SELECT hash, "from" AS sender FROM txs
			WHERE hash IN (${list(hashes)}) AND block_num >= ${firstBlock}`,
		).catch((error) => {
			console.error('Failed to read Uniswap swap senders:', error)
			return []
		})
		for (const tx of txs) {
			const sender = addressOf(tx.sender)
			if (sender) senders.set(String(tx.hash).toLowerCase(), sender)
		}
	}

	return rows.flatMap((row): UniswapTrade[] => {
		try {
			const topics = [row.topic0, row.topic1, row.topic2].map((topic) =>
				String(topic),
			) as [Hex, Hex, Hex]
			const { args } = decodeEventLog({
				abi: poolManagerAbi,
				eventName: 'Swap',
				topics,
				data: String(row.data) as Hex,
			})
			const id = args.id.toLowerCase() as Hex
			const pool = meta.pools.find((pool) => pool.config.id === id)
			if (!pool) return []
			// Deltas are the swapper's: negative is what it paid the pool.
			const [baseDelta, quoteDelta] = pool.baseIs0
				? [args.amount0, args.amount1]
				: [args.amount1, args.amount0]
			const abs = (value: bigint) => (value < 0n ? -value : value)
			const baseAmount = Number(formatUnits(abs(baseDelta), pool.base.decimals))
			const quoteAmount = Number(
				formatUnits(abs(quoteDelta), pool.quote.decimals),
			)
			const hash = String(row.tx_hash).toLowerCase()
			return [
				{
					id: `${hash}-${row.log_idx}`,
					poolKey: id,
					transactionHash: hash as Hex,
					timestamp: Number(row.ts),
					taker: senders.get(hash) ?? (args.sender.toLowerCase() as Address),
					baseIn: baseDelta < 0n,
					baseAmount,
					quoteAmount,
					value:
						pool.usdSide === 'quote'
							? quoteAmount
							: pool.usdSide === 'base'
								? baseAmount
								: null,
				},
			]
		} catch (error) {
			console.error('Failed to decode a Uniswap swap:', error)
			return []
		}
	})
}

export const fetchUniswapPools = createServerFn({ method: 'GET' }).handler(
	async (): Promise<UniswapSnapshot> => {
		try {
			return await withImmutableDataCache({
				key: `uniswap-pools:v1:${getTempoChain().id}`,
				ttlSeconds: POOLS_TTL,
				load: () =>
					withDeadline(getUniswapPools(), META_DEADLINE + POOLS_DEADLINE),
				shouldCache: (snapshot) => snapshot.complete,
			})
		} catch (error) {
			console.error('Failed to load Uniswap pools:', error)
			throw new Error(
				'Uniswap pools are temporarily unavailable. Please try again.',
			)
		}
	},
)

export const fetchUniswapTrades = createServerFn({ method: 'GET' }).handler(
	async (): Promise<UniswapTrade[]> => {
		try {
			return await withImmutableDataCache({
				key: `uniswap-trades:v1:${getTempoChain().id}`,
				ttlSeconds: TRADES_TTL,
				load: () =>
					withDeadline(getUniswapTrades(), META_DEADLINE + TRADES_DEADLINE),
			})
		} catch (error) {
			console.error('Failed to load Uniswap trades:', error)
			throw new Error(
				'Uniswap trades are temporarily unavailable. Please try again.',
			)
		}
	},
)
