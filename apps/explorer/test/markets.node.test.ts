import { describe, expect, it } from 'vitest'
import type { DexPool, DexPoolToken } from '#lib/dex-pools.ts'
import {
	dexRows,
	dexStatus,
	dexTrade,
	legacyMarketsSearch,
	marketTotals,
	mergeTrades,
	propAmmRows,
	propAmmStatus,
	sortMarkets,
} from '#lib/markets.ts'
import type { PropAmmPool } from '#lib/propamm.ts'

const token = (symbol: string, address: string): DexPoolToken => ({
	address: address as DexPoolToken['address'],
	symbol,
	decimals: 6,
	verified: true,
})
const usdc = token('USDC.e', '0x20c0000000000000000000000000000000000001')
const path = token('pathUSD', '0x20c0000000000000000000000000000000000000')
const eurc = token('EURC.e', '0x20c0000000000000000000000000000000000002')
const ousd = token('OUSD', '0x20c0000000000000000000000000000000000003')

const dexPool = (overrides: Partial<DexPool> = {}): DexPool => ({
	key: '0x01',
	base: usdc,
	quote: path,
	status: 'active',
	bid: 0.9998,
	ask: 1.0002,
	liquidity: { bid: 600, ask: 400, total: 1_000, partial: false },
	volume: { day: 10, month: 100 },
	...overrides,
})

const venue = '0x00000000000000000000000000000000000000aa'
const propPool = (overrides: Partial<PropAmmPool> = {}): PropAmmPool => ({
	key: `${venue}-0`,
	version: 'v2',
	address: venue,
	pairIndex: 0,
	base: eurc,
	quote: ousd,
	price: 1.12,
	state: 'live',
	baseBalance: 100,
	quoteBalance: 200,
	baseValue: 112,
	quoteValue: 200,
	inventory: 312,
	...overrides,
})

const loaded = <data>(data: data) => ({ data, failed: false })
const failed = { data: undefined, failed: true }
const loading = { data: undefined, failed: false }

describe('marketTotals', () => {
	it('counts a v2 venue’s balances once across its pairs', () => {
		const pools = [
			propPool(),
			// A second pair on the same venue shares its OUSD balance.
			propPool({
				key: `${venue}-1`,
				pairIndex: 1,
				base: path,
				baseValue: 50,
				inventory: 250,
			}),
		]
		const totals = marketTotals({
			venues: ['dex', 'propamm'],
			dex: loaded([dexPool()]),
			propAmm: loaded({ pools, complete: true }),
			propAmmTrades: loaded({
				[pools[0]?.key]: {
					volume: { day: 1, month: 2 },
					trades: { day: 1, month: 1 },
					lastTradeAt: null,
				},
			}),
		})
		// DEX 1,000 + EURC 112 + OUSD 200 (once) + pathUSD 50.
		expect(totals.liquidity).toEqual({
			value: 1_362,
			partial: false,
			unknown: false,
		})
		expect(totals.day).toEqual({ value: 11, partial: false, unknown: false })
		expect(totals.month).toEqual({ value: 102, partial: false, unknown: false })
	})

	it('only counts liquidity of books swaps route through', () => {
		const totals = marketTotals({
			venues: ['dex'],
			dex: loaded([dexPool(), dexPool({ key: '0x02', status: 'retired' })]),
			propAmm: failed,
			propAmmTrades: failed,
		})
		expect(totals.liquidity?.value).toBe(1_000)
		// The other venue failed, but this view doesn't include it.
		expect(totals.liquidity?.partial).toBe(false)
		expect(totals.month?.value).toBe(200)
	})

	it('marks totals partial when a venue fails, and unknown when all do', () => {
		const partial = marketTotals({
			venues: ['dex', 'propamm'],
			dex: loaded([dexPool()]),
			propAmm: failed,
			propAmmTrades: failed,
		})
		expect(partial.liquidity).toEqual({
			value: 1_000,
			partial: true,
			unknown: false,
		})
		expect(partial.day?.partial).toBe(true)

		const none = marketTotals({
			venues: ['dex', 'propamm'],
			dex: failed,
			propAmm: failed,
			propAmmTrades: failed,
		})
		expect(none.liquidity?.unknown).toBe(true)
	})

	it('marks totals partial for unread balances or pools', () => {
		const totals = marketTotals({
			venues: ['propamm'],
			dex: loading,
			propAmm: loaded({
				pools: [propPool({ quoteValue: null })],
				complete: true,
			}),
			propAmmTrades: loaded({}),
		})
		expect(totals.liquidity).toEqual({
			value: 112,
			partial: true,
			unknown: false,
		})
		const incomplete = marketTotals({
			venues: ['propamm'],
			dex: loading,
			propAmm: loaded({ pools: [propPool()], complete: false }),
			propAmmTrades: loaded({}),
		})
		expect(incomplete.liquidity?.partial).toBe(true)
	})

	it('waits for every included read', () => {
		const totals = marketTotals({
			venues: ['dex', 'propamm'],
			dex: loaded([dexPool()]),
			propAmm: loading,
			propAmmTrades: loaded({}),
		})
		expect(totals.liquidity).toBeNull()
		expect(totals.day).not.toBeNull()
	})
})

describe('status', () => {
	it('maps DEX books', () => {
		expect(dexStatus('active')).toEqual({ status: 'live', detail: null })
		expect(dexStatus('place-only').status).toBe('limited')
		expect(dexStatus('retired').status).toBe('off')
	})

	it('maps propAMM states', () => {
		expect(propAmmStatus('live').status).toBe('live')
		for (const state of [
			'expired',
			'off',
			'bids_only',
			'asks_only',
			'stale',
		] as const)
			expect(propAmmStatus(state).status).toBe('limited')
		for (const state of ['paused', 'closed', 'unknown'] as const)
			expect(propAmmStatus(state).status).toBe('off')
		expect(propAmmStatus('expired').detail).toBe('Quote expired')
	})
})

describe('rows', () => {
	it('prices DEX books at the mid and drops idle retired books', () => {
		const rows = dexRows([
			dexPool(),
			dexPool({ key: '0x02', status: 'retired', volume: { day: 0, month: 0 } }),
		])
		expect(rows).toHaveLength(1)
		expect(rows[0]?.price).toBeCloseTo(1)
		expect(rows[0]?.spread).toBeCloseTo(4)
	})

	it('links a propAMM pool to the pair page when both tokens are TIP-20', () => {
		const [linked] = propAmmRows([propPool()], undefined)
		expect(linked?.link).toEqual({
			kind: 'pair',
			from: eurc.address,
			to: ousd.address,
		})
		expect(linked?.volume).toBeNull()
		const [own] = propAmmRows(
			[
				propPool({
					base: token('X', '0x00000000000000000000000000000000000000bb'),
				}),
			],
			{},
		)
		expect(own?.link).toEqual({ kind: 'address', address: venue })
		expect(own?.volume).toEqual({ day: 0, month: 0 })
	})

	it('sorts unknown values last in either direction', () => {
		const rows = [...propAmmRows([propPool()], {}), ...dexRows([dexPool()])]
		expect(sortMarkets(rows, 'spread', 'asc')[0]?.venue).toBe('dex')
		expect(sortMarkets(rows, 'spread', 'desc')[0]?.venue).toBe('dex')
		expect(sortMarkets(rows, 'liquidity', 'asc')[0]?.venue).toBe('propamm')
	})
})

describe('trades', () => {
	const swap = {
		id: '1',
		transactionHash: '0x01' as const,
		timestamp: 10,
		taker: venue,
		from: path,
		to: usdc,
		amountIn: 5,
		amountOut: 4.99,
	}

	it('labels a DEX swap by its book', () => {
		const buy = dexTrade(swap, [dexPool()])
		expect(buy).toMatchObject({ side: 'buy', base: usdc, baseAmount: 4.99 })
		const sell = dexTrade({ ...swap, from: usdc, to: path }, [dexPool()])
		expect(sell).toMatchObject({ side: 'sell', base: usdc, baseAmount: 5 })
		expect(dexTrade(swap, []).side).toBeNull()
	})

	it('merges newest first', () => {
		const a = dexTrade(swap, [dexPool()])
		const b = { ...a, id: 'b', timestamp: 20 }
		expect(mergeTrades([a], [b]).map((trade) => trade.id)).toEqual(['b', a.id])
	})
})

describe('legacyMarketsSearch', () => {
	it('maps old list links', () => {
		expect(
			legacyMarketsSearch('dex', { tab: 'swaps', sort: 'spread' }),
		).toEqual({ venue: 'dex', tab: 'trades', sort: 'spread' })
		expect(
			legacyMarketsSearch('propamm', { sort: 'inventory', dir: 'asc' }),
		).toEqual({ venue: 'propamm', sort: 'liquidity', dir: 'asc' })
		expect(legacyMarketsSearch('dex', { sort: 'bogus' })).toEqual({
			venue: 'dex',
		})
	})
})
