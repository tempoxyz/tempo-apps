import { describe, expect, it } from 'vitest'
import { isForcedHour } from './schedule.js'

describe('isForcedHour', () => {
	it('is true at UTC midnight', () => {
		expect(isForcedHour(Date.UTC(2026, 5, 1, 0, 0, 0))).toBe(true)
	})

	it('is false for every non-midnight UTC hour', () => {
		for (let h = 1; h < 24; h++) {
			expect(isForcedHour(Date.UTC(2026, 5, 1, h, 0, 0))).toBe(false)
		}
	})

	it('uses UTC, not local timezone', () => {
		// 15:00 UTC is 00:00 in JST the next day — must NOT be a forced hour.
		expect(isForcedHour(Date.UTC(2026, 5, 1, 15, 0, 0))).toBe(false)
	})
})
