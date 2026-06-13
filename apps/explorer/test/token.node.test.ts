import { describe, expect, it } from 'vitest'
import { resolveTotal } from '#lib/server/token'

describe('resolveTotal', () => {
	it('prefers the exact count when below the positional window', () => {
		expect(
			resolveTotal({
				exactCount: 42,
				page: 1,
				limit: 10,
				rows: 10,
				exhausted: false,
			}),
		).toEqual({ total: 42, totalCapped: false })
	})

	it('clamps exact counts above the window and marks them capped', () => {
		expect(
			resolveTotal({
				exactCount: 69_739,
				page: 1,
				limit: 10,
				rows: 10,
				exhausted: false,
			}),
		).toEqual({ total: 10_000, totalCapped: true })
	})

	it('derives an exact total when the feed ends inside the page', () => {
		expect(
			resolveTotal({
				exactCount: undefined,
				page: 3,
				limit: 10,
				rows: 7,
				exhausted: true,
			}),
		).toEqual({ total: 27, totalCapped: false })
	})

	it('reports the window cap when more pages remain and no count exists', () => {
		expect(
			resolveTotal({
				exactCount: undefined,
				page: 1,
				limit: 10,
				rows: 10,
				exhausted: false,
			}),
		).toEqual({ total: 10_000, totalCapped: true })
	})

	it('page-aligns the cap so the last page stays inside the window', () => {
		// floor(10_000 / 33) * 33 = 9_999: page 303 × 33 ≤ 10_000 stays valid.
		expect(
			resolveTotal({
				exactCount: 50_000,
				page: 1,
				limit: 33,
				rows: 33,
				exhausted: false,
			}),
		).toEqual({ total: 9_999, totalCapped: true })
	})
})
