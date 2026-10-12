import { describe, expect, it } from 'vitest'
import { forcedSourceIds } from './schedule.js'

describe('forcedSourceIds', () => {
	it('forces each source once per UTC day and spreads sources across hours', () => {
		const sourceIds = Array.from({ length: 27 }, (_, i) => `source-${i}`)
		const seen = new Map(sourceIds.map((id) => [id, 0]))
		for (let hour = 0; hour < 24; hour++) {
			const forced = forcedSourceIds(Date.UTC(2026, 5, 1, hour), sourceIds)
			expect(forced.size).toBeLessThanOrEqual(2)
			for (const id of forced) seen.set(id, (seen.get(id) ?? 0) + 1)
		}
		expect([...seen.values()]).toEqual(Array(sourceIds.length).fill(1))
	})

	it('uses UTC hours', () => {
		expect(forcedSourceIds(Date.UTC(2026, 5, 1, 15), ['a', 'b'])).toEqual(
			new Set(),
		)
		expect(forcedSourceIds(Date.UTC(2026, 5, 1, 0), ['a', 'b'])).toEqual(
			new Set(['a']),
		)
	})
})
