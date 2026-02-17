import { describe, expect, it } from 'vitest'
import { toUnixTimestamp, computePriceNative } from '../src/gecko.utils.ts'

describe('toUnixTimestamp', () => {
	it('parses IDX timestamptz with 3-part offset', () => {
		expect(toUnixTimestamp('2026-01-12 10:17:25.0 +00:00:00')).toBe(1768213045)
	})

	it('parses standard ISO string', () => {
		expect(toUnixTimestamp('2024-01-15T12:00:00Z')).toBe(1705320000)
	})

	it('passes through unix seconds (number)', () => {
		expect(toUnixTimestamp(1705320000)).toBe(1705320000)
	})

	it('converts unix milliseconds to seconds (number)', () => {
		expect(toUnixTimestamp(1705320000000)).toBe(1705320000)
	})

	it('passes through unix seconds as string', () => {
		expect(toUnixTimestamp('1705320000')).toBe(1705320000)
	})

	it('converts unix milliseconds to seconds as string', () => {
		expect(toUnixTimestamp('1705320000000')).toBe(1705320000)
	})
})

describe('computePriceNative', () => {
	const ONE = 10n ** 18n

	it('returns 1 for equal decimals with 1:1 price', () => {
		const result = computePriceNative(ONE, 18, 18, ONE)
		expect(Number.parseFloat(result)).toBe(1)
	})

	it('returns valid non-zero numeric for different decimals (18/6)', () => {
		const result = computePriceNative(ONE, 18, 6, ONE)
		const num = Number.parseFloat(result)
		expect(num).toBeGreaterThan(0)
		expect(Number.isFinite(num)).toBe(true)
	})

	it('returns zero for zero tickPrice', () => {
		const result = computePriceNative(0n, 18, 18, ONE)
		expect(Number.parseFloat(result)).toBe(0)
	})

	it('handles large tickPrice without overflow', () => {
		const large = 10n ** 30n
		const result = computePriceNative(large, 18, 18, ONE)
		const num = Number.parseFloat(result)
		expect(num).toBeGreaterThan(0)
		expect(Number.isFinite(num)).toBe(true)
	})
})
