import type { Address, Hex } from 'viem'
import type { DexPoolToken } from '#lib/dex-pools'

/**
 * Uniswap v4 pools: one singleton PoolManager holds every pool, keyed by a
 * pool ID. Anyone can initialize a pool, so only Tempo's main ones are
 * listed: those with real liquidity or volume.
 */
export type UniswapPoolConfig = {
	id: Hex
	currency0: Address
	currency1: Address
	/** In hundredths of a basis point: 100 is 0.01%. */
	fee: number
	tickSpacing: number
}

/** Each chain's PoolManager. */
export const poolManagers: Record<number, Address> = {
	4217: '0x33620f62c5b9b2086dd6b62f4a297a9f30347029',
}

const pathUsd = '0x20c0000000000000000000000000000000000000'
const usdcE = '0x20c000000000000000000000b9537d11c60e8b50'

export const uniswapPools: Record<number, readonly UniswapPoolConfig[]> = {
	// Tempo mainnet.
	4217: [
		{
			// pathUSD/PRIME 0.01%
			id: '0x0b9a0ce880fd51829b650bf2bbacff62f10ffe274b2250b2c3cf1c5614aab427',
			currency0: pathUsd,
			currency1: '0x20c00000000000000000000058d0b8b2cfdb358c',
			fee: 100,
			tickSpacing: 1,
		},
		{
			// OUSD/cbBTC 0.3%
			id: '0x20af2b1bc104ca0147b66fa10be4816e2e27b30416b958b67d0eaa2f7dfe7edd',
			currency0: '0x20c0000000000000000000006a37da5c996874be',
			currency1: '0x20c000000000000000000000c412ec89d0c08be5',
			fee: 3000,
			tickSpacing: 10,
		},
		{
			// pathUSD/USDC.e 0.01%
			id: '0xbd170b4ccb7f5da2565e00d5bbfa4777187b20ffb824412766463c162a47d78a',
			currency0: pathUsd,
			currency1: usdcE,
			fee: 100,
			tickSpacing: 1,
		},
		{
			// pathUSD/USDT0 0.01%
			id: '0xc67d0326ad7b8ae021d3c93df2eefe1283290475cf5b18a8fda8bf97a722577b',
			currency0: pathUsd,
			currency1: '0x20c00000000000000000000014f22ca97301eb73',
			fee: 100,
			tickSpacing: 1,
		},
		{
			// stcUSD/USDC.e 0.01%
			id: '0xa2aa1b8f7b20863d54720b019e282fe8b955d4e7519c9d2035d8fc3350ca08d8',
			currency0: '0x20c0000000000000000000008ee4fcff88888888',
			currency1: usdcE,
			fee: 100,
			tickSpacing: 1,
		},
		{
			// pathUSD/BRLA 0.01%
			id: '0x16cfb625c5342ee764301b7c3a2c1311772865775477617b4ae8b879c83ef184',
			currency0: pathUsd,
			currency1: '0x20c000000000000000000000f047dd7018e50367',
			fee: 100,
			tickSpacing: 1,
		},
	],
}

export function uniswapPoolsFor(chainId: number): readonly UniswapPoolConfig[] {
	return (uniswapPools[chainId] ?? []).map((pool) => ({
		...pool,
		id: pool.id.toLowerCase() as Hex,
		currency0: pool.currency0.toLowerCase() as Address,
		currency1: pool.currency1.toLowerCase() as Address,
	}))
}

/** The fee as a percentage label, such as 0.01%. */
export function feeLabel(fee: number): string {
	return `${Number((fee / 10_000).toFixed(4))}%`
}

/** 2^96, the scale of sqrtPriceX96. */
const Q96 = 2 ** 96

/** slot0's packed fields (v4-core StateLibrary). */
export function decodeSlot0(word: bigint): {
	sqrtPriceX96: bigint
	tick: number
	lpFee: number
} {
	const rawTick = Number((word >> 160n) & 0xffffffn)
	return {
		sqrtPriceX96: word & ((1n << 160n) - 1n),
		tick: rawTick >= 0x800000 ? rawTick - 0x1000000 : rawTick,
		lpFee: Number((word >> 208n) & 0xffffffn),
	}
}

/**
 * Whether currency0 is the base, oriented like a Stablecoin DEX book: a pool
 * of one USD token and another token is quoted in the USD token; otherwise in
 * the currency the other names as its quote token; otherwise in currency1.
 */
export function baseIsCurrency0(input: {
	usd0: boolean
	usd1: boolean
	quoteOf0: Address | null
	quoteOf1: Address | null
	currency0: Address
	currency1: Address
}): boolean {
	if (input.usd0 !== input.usd1) return input.usd1
	if (input.quoteOf0 === input.currency1) return true
	return input.quoteOf1 !== input.currency0
}

/** currency1 per currency0, in token units. */
export function price1Per0(
	sqrtPriceX96: bigint,
	decimals0: number,
	decimals1: number,
): number {
	return (Number(sqrtPriceX96) / Q96) ** 2 * 10 ** (decimals0 - decimals1)
}

/** One liquidity range: its ticks and the liquidity added minus removed. */
export type LiquidityRange = {
	tickLower: number
	tickUpper: number
	liquidity: bigint
}

/**
 * The raw token amounts a pool's ranges hold at its current price, from the
 * concentrated-liquidity formulas, and the liquidity active at its tick.
 * Uncollected fees aren't counted.
 */
export function poolReserves(
	ranges: readonly LiquidityRange[],
	sqrtPriceX96: bigint,
	tick: number,
): { amount0: number; amount1: number; active: number } {
	const price = Number(sqrtPriceX96) / Q96
	let amount0 = 0
	let amount1 = 0
	let active = 0
	for (const range of ranges) {
		if (range.liquidity <= 0n) continue
		const liquidity = Number(range.liquidity)
		const lower = 1.0001 ** (range.tickLower / 2)
		const upper = 1.0001 ** (range.tickUpper / 2)
		if (price <= lower)
			amount0 += (liquidity * (upper - lower)) / (lower * upper)
		else if (price >= upper) amount1 += liquidity * (upper - lower)
		else {
			amount0 += (liquidity * (upper - price)) / (price * upper)
			amount1 += liquidity * (price - lower)
		}
		if (range.tickLower <= tick && tick < range.tickUpper) active += liquidity
	}
	return { amount0, amount1, active }
}

/**
 * - live: liquidity is in range at the current price.
 * - out_of_range: positions exist, but none covers the current price.
 * - empty: no open positions.
 * - unknown: the positions couldn't be read.
 */
export type UniswapState = 'live' | 'out_of_range' | 'empty' | 'unknown'

export const uniswapStateLabels: Record<UniswapState, string> = {
	live: 'Live',
	out_of_range: 'Out of range',
	empty: 'No liquidity',
	unknown: 'Unknown',
}

export type UniswapPool = {
	/** The pool ID. */
	key: Hex
	/** The PoolManager holding the pool. */
	manager: Address
	base: DexPoolToken
	quote: DexPoolToken
	fee: number
	/** Quote per base. */
	price: number | null
	state: UniswapState
	/** Base and quote held at the current price, in US dollars; null when unknown or neither side is USD. */
	baseValue: number | null
	quoteValue: number | null
	reserves: number | null
	/** Null when the indexer couldn't sum the pool's swaps. */
	volume: { day: number; month: number } | null
}

export type UniswapSnapshot = {
	generatedAt: number
	/** Every listed pool, its positions and volume were read. */
	complete: boolean
	pools: UniswapPool[]
}

export type UniswapTrade = {
	id: string
	poolKey: Hex
	transactionHash: Hex
	timestamp: number
	/** The transaction's sender: a swap's own sender is the router. */
	taker: Address
	/** The taker sold base for quote. */
	baseIn: boolean
	baseAmount: number
	quoteAmount: number
	/** In US dollars, from the pool's USD side; null when neither side is USD. */
	value: number | null
}
