import { describe, expect, it } from 'vitest'
import { toTimestamp } from './index-supply'

describe('toTimestamp()', () => {
	it('parses timestamptz', () => {
		const result = toTimestamp('2025-11-11 9:30:45.123456')
		const expected = BigInt(
			Math.floor(new Date('2025-11-11T09:30:45Z').getTime() / 1000),
		)
		expect(result).toBe(expected)
	})

	it('parses timestamptz without microseconds', () => {
		const result = toTimestamp('2024-01-01 12:34:56')
		expect(result).toBeGreaterThan(0n)
		expect(typeof result).toBe('bigint')
	})

	it('throws for invalid timestamp format', () => {
		expect(() => toTimestamp('invalid-date')).toThrow(
			'Invalid timestamp format',
		)
	})
})
