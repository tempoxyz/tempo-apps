import { describe, expect, it } from 'vitest'
import { normalizeSearchInput, parseTempoAddress } from '#lib/tempo-address'

const SAMPLE_ADDRESS = '0x742d35cc6634c0532925a3b844bc9e7595f2bd28'

describe('normalizeSearchInput', () => {
	it('normalizes a mainnet tempox address to the 0x address', () => {
		expect(normalizeSearchInput(`tempox${SAMPLE_ADDRESS}`)).toBe(SAMPLE_ADDRESS)
	})

	it('normalizes a zoned tempo address with a trailing zone label', () => {
		expect(normalizeSearchInput(`tempoz01x${SAMPLE_ADDRESS} (zone 01)`)).toBe(
			SAMPLE_ADDRESS,
		)
	})

	it('normalizes a partial tempox address for prefix search', () => {
		expect(normalizeSearchInput('tempox0x20c000')).toBe('0x20c000')
	})

	it('normalizes a raw 0x address with a trailing zone label', () => {
		expect(normalizeSearchInput(`${SAMPLE_ADDRESS} (zone devnet)`)).toBe(
			SAMPLE_ADDRESS,
		)
	})

	it('keeps non-address search terms unchanged', () => {
		expect(normalizeSearchInput('tempo')).toBe('tempo')
	})
})

describe('parseTempoAddress', () => {
	it('parses a mainnet tempox address', () => {
		expect(parseTempoAddress(`tempox${SAMPLE_ADDRESS}`)).toEqual({
			address: SAMPLE_ADDRESS,
			zoneId: null,
		})
	})

	it('parses a zoned tempo address and decodes the zone id', () => {
		expect(parseTempoAddress(`tempozffx${SAMPLE_ADDRESS}`)).toEqual({
			address: SAMPLE_ADDRESS,
			zoneId: 255,
		})
	})

	it('parses a raw address with a trailing zone label', () => {
		expect(parseTempoAddress(`${SAMPLE_ADDRESS} (zone testnet)`)).toEqual({
			address: SAMPLE_ADDRESS,
			zoneId: null,
		})
	})

	it('returns null for invalid input', () => {
		expect(parseTempoAddress('tempox0x1234')).toBeNull()
	})
})
