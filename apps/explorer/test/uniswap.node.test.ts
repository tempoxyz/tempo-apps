import { describe, expect, it } from 'vitest'
import type { DexPoolToken } from '#lib/dex-pools.ts'
import { marketTotals, uniswapRows, uniswapTrade } from '#lib/markets.ts'
import {
	baseIsCurrency0,
	decodeSlot0,
	feeLabel,
	poolReserves,
	price1Per0,
	type UniswapPool,
	uniswapPoolsFor,
} from '#lib/uniswap.ts'

const token = (symbol: string, address: string): DexPoolToken => ({
	address: address as DexPoolToken['address'],
	symbol,
	decimals: 6,
	verified: true,
})
const path = token('pathUSD', '0x20c0000000000000000000000000000000000000')
const prime = token('PRIME', '0x20c00000000000000000000058d0b8b2cfdb358c')

const pool = (overrides: Partial<UniswapPool> = {}): UniswapPool => ({
	key: '0x0b9a0ce880fd51829b650bf2bbacff62f10ffe274b2250b2c3cf1c5614aab427',
	manager: '0x33620f62c5b9b2086dd6b62f4a297a9f30347029',
	base: prime,
	quote: path,
	fee: 100,
	price: 1.07,
	state: 'live',
	baseValue: 600,
	quoteValue: 400,
	reserves: 1_000,
	volume: { day: 5, month: 50 },
	...overrides,
})

describe('decodeSlot0', () => {
	it('reads the live pathUSD/PRIME slot', () => {
		// extsload of the pool's slot0 on mainnet.
		const slot =
			decodeSlot0(
				0x000000000064000000fffd6b0000000000000000f7ada3ef2c6e8ab6721caec8n,
			)
		expect(slot.tick).toBe(-661)
		expect(slot.lpFee).toBe(100)
		// The tick and the price agree: 1.0001^-661.
		expect(price1Per0(slot.sqrtPriceX96, 6, 6)).toBeCloseTo(1.0001 ** -661, 4)
	})
})

describe('poolReserves', () => {
	const sqrt = (tick: number) =>
		BigInt(Math.round(1.0001 ** (tick / 2) * 2 ** 96))

	it('holds both tokens in range and one out of it', () => {
		const ranges = [
			{ tickLower: -100, tickUpper: 100, liquidity: 10n ** 12n },
			{ tickLower: 200, tickUpper: 300, liquidity: 10n ** 12n },
			{ tickLower: -300, tickUpper: -200, liquidity: 10n ** 12n },
		]
		const held = poolReserves(ranges, sqrt(0), 0)
		// The range around the price holds both; one above it only token0,
		// one below it only token1.
		const r = (tick: number) => 1.0001 ** (tick / 2)
		const L = 1e12
		const amount0 =
			L * (1 - 1 / r(100)) + (L * (r(300) - r(200))) / (r(200) * r(300))
		const amount1 = L * (1 - r(-100)) + L * (r(-200) - r(-300))
		expect(held.amount0 / amount0).toBeCloseTo(1, 6)
		expect(held.amount1 / amount1).toBeCloseTo(1, 6)
		expect(held.active).toBe(1e12)
	})

	it('ignores closed ranges', () => {
		const held = poolReserves(
			[{ tickLower: -10, tickUpper: 10, liquidity: 0n }],
			sqrt(0),
			0,
		)
		expect(held).toEqual({ amount0: 0, amount1: 0, active: 0 })
	})
})

describe('baseIsCurrency0', () => {
	const c0 = '0x20c0000000000000000000000000000000000000' as const
	const c1 = '0x20c0000000000000000000000000000000000001' as const
	it('quotes in the USD token when only one is USD', () => {
		expect(
			baseIsCurrency0({
				usd0: true,
				usd1: false,
				quoteOf0: null,
				quoteOf1: null,
				currency0: c0,
				currency1: c1,
			}),
		).toBe(false)
		expect(
			baseIsCurrency0({
				usd0: false,
				usd1: true,
				quoteOf0: null,
				quoteOf1: null,
				currency0: c0,
				currency1: c1,
			}),
		).toBe(true)
	})
	it('otherwise quotes in the token the other names as its quote', () => {
		expect(
			baseIsCurrency0({
				usd0: true,
				usd1: true,
				quoteOf0: null,
				quoteOf1: c0,
				currency0: c0,
				currency1: c1,
			}),
		).toBe(false)
		expect(
			baseIsCurrency0({
				usd0: true,
				usd1: true,
				quoteOf0: c1,
				quoteOf1: null,
				currency0: c0,
				currency1: c1,
			}),
		).toBe(true)
		expect(
			baseIsCurrency0({
				usd0: true,
				usd1: true,
				quoteOf0: null,
				quoteOf1: null,
				currency0: c0,
				currency1: c1,
			}),
		).toBe(true)
	})
})

describe('uniswap pools', () => {
	it('lists mainnet pools only', () => {
		expect(uniswapPoolsFor(4217).length).toBeGreaterThan(0)
		expect(uniswapPoolsFor(42431)).toEqual([])
		expect(feeLabel(100)).toBe('0.01%')
		expect(feeLabel(3000)).toBe('0.3%')
	})

	it('becomes a market row with its fee tier', () => {
		const [row] = uniswapRows([
			pool(),
			pool({ state: 'out_of_range', reserves: null }),
		])
		expect(row).toMatchObject({
			venue: 'uniswap',
			kind: 'Uniswap 0.01%',
			liquidity: { value: 1_000, partial: false },
			status: 'live',
			link: {
				kind: 'address',
				address: '0x33620f62c5b9b2086dd6b62f4a297a9f30347029',
			},
		})
		const [, out] = uniswapRows([
			pool(),
			pool({ state: 'out_of_range', reserves: null }),
		])
		expect(out).toMatchObject({
			status: 'limited',
			statusDetail: 'Out of range',
			liquidity: null,
		})
	})

	it('adds to the totals, partial when a pool is unread', () => {
		const totals = marketTotals({
			venues: ['uniswap'],
			dex: { data: undefined, failed: false },
			propAmm: { data: undefined, failed: false },
			propAmmTrades: { data: undefined, failed: false },
			uniswap: {
				data: {
					generatedAt: 0,
					complete: true,
					pools: [pool(), pool({ key: '0x01', reserves: null, volume: null })],
				},
				failed: false,
			},
		})
		expect(totals.liquidity).toEqual({
			value: 1_000,
			partial: true,
			unknown: false,
		})
		expect(totals.month).toEqual({ value: 50, partial: true, unknown: false })
	})

	it('waits for the venue while it is in view', () => {
		const totals = marketTotals({
			venues: ['uniswap'],
			dex: { data: undefined, failed: false },
			propAmm: { data: undefined, failed: false },
			propAmmTrades: { data: undefined, failed: false },
		})
		expect(totals.liquidity).toBeNull()
	})

	it('labels a swap by its pool', () => {
		const pools = new Map([[pool().key, pool()]])
		const swap = {
			id: '0xaa-0',
			poolKey: pool().key,
			transactionHash: '0xaa',
			timestamp: 1,
			taker: '0x00000000000000000000000000000000000000bb',
			baseIn: true,
			baseAmount: 10,
			quoteAmount: 10.7,
			value: 10.7,
		} as const
		const trade = uniswapTrade(swap, pools)
		expect(trade).toMatchObject({
			venue: 'uniswap',
			side: 'sell',
			base: prime,
			quote: path,
		})
		expect(uniswapTrade({ ...swap, poolKey: '0x02' }, pools)).toBeNull()
	})
})
