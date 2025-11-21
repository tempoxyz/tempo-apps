import { describe, expect, it } from 'vitest'
import { parsePgTimestamp } from './postgres'

describe('parsePgTimestamp()', () => {
	it('parses timestamptz', () => {
		const result = parsePgTimestamp('2025-11-11 9:30:45.123456')
		const expected = Math.floor(
			new Date('2025-11-11T09:30:45Z').getTime() / 1000,
		)
		expect(result).toBe(expected)
	})

	it('parses timestamptz without microseconds', () => {
		const result = parsePgTimestamp('2024-01-01 12:34:56')
		expect(result).toBeGreaterThan(0)
		expect(Number.isInteger(result)).toBe(true)
	})

	it('throws for invalid timestamp format', () => {
		expect(() => parsePgTimestamp('invalid-date')).toThrow(
			'Invalid timestamp format',
		)
	})
})
