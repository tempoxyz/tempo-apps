import { describe, expect, it } from 'vitest'
import {
	decodeHotWord,
	type PropAmmPool,
	sortPropAmmPools,
	v1State,
	v2State,
} from '#lib/propamm.ts'

describe('decodeHotWord', () => {
	it('reads the mid, validity and side flags', () => {
		// EURC.e/OUSD's hot word on mainnet.
		const word =
			decodeHotWord(
				0x00000000acde006aeb815e0003e803e800000000000000000f90cffeb0329000n,
			)
		expect(word.mid).toBe(1_121_625_000_000_000_000n)
		expect(word.validUntil).toBe(1_793_818_974)
		expect(word.bidsOff).toBe(false)
		expect(word.asksOff).toBe(false)
	})

	it('reads the side flags from the top bits', () => {
		const word = decodeHotWord((3n << 240n) | 1n)
		expect(word.bidsOff).toBe(true)
		expect(word.asksOff).toBe(true)
	})
})

describe('v2State', () => {
	const live = {
		halted: false,
		access: 2,
		mid: 1n,
		validUntil: 200,
		bidsOff: false,
		asksOff: false,
		now: 100,
	}

	it('is live with a current quote on an admitting pair', () => {
		expect(v2State(live)).toBe('live')
	})

	it('reports a halted venue before the pair', () => {
		expect(v2State({ ...live, halted: true, access: 1 })).toBe('paused')
	})

	it('reports a closed pair, an expired quote and both sides off', () => {
		expect(v2State({ ...live, access: 1 })).toBe('closed')
		expect(v2State({ ...live, validUntil: 99 })).toBe('expired')
		expect(v2State({ ...live, mid: 0n })).toBe('expired')
		expect(v2State({ ...live, bidsOff: true, asksOff: true })).toBe('off')
		expect(v2State({ ...live, asksOff: true })).toBe('bids_only')
		expect(v2State({ ...live, bidsOff: true })).toBe('asks_only')
	})

	it('treats a removed pair as unknown', () => {
		expect(v2State({ ...live, access: 0 })).toBe('unknown')
	})
})

describe('v1State', () => {
	it('is paused, stale or live', () => {
		const input = { paused: false, priceAt: 50, maxOracleAge: 60, now: 100 }
		expect(v1State(input)).toBe('live')
		expect(v1State({ ...input, paused: true })).toBe('paused')
		expect(v1State({ ...input, priceAt: 10 })).toBe('stale')
		expect(v1State({ ...input, priceAt: null })).toBe('unknown')
	})
})

describe('sortPropAmmPools', () => {
	const pool = (symbol: string, inventory: number | null) =>
		({
			base: { symbol },
			inventory,
			volume: { day: 0, month: 0 },
		}) as unknown as PropAmmPool

	it('puts pools without a price last when sorting by inventory', () => {
		const sorted = sortPropAmmPools(
			[pool('A', null), pool('B', 5), pool('C', 10)],
			'inventory',
			'desc',
		)
		expect(sorted.map((pool) => pool.base.symbol)).toEqual(['C', 'B', 'A'])
	})
})
