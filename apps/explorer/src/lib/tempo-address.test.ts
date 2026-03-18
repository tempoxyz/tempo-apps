import { describe, expect, it } from 'vitest'
import { TempoAddress } from 'viem/tempo'
import { normalizeSearchInput } from '#lib/tempo-address'

const SAMPLE_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28'
const SAMPLE_TEMPO_ADDRESS = TempoAddress.format(SAMPLE_ADDRESS)
const SAMPLE_PARSED_ADDRESS = TempoAddress.parse(SAMPLE_TEMPO_ADDRESS).address

describe('normalizeSearchInput', () => {
	it('normalizes a tempo address to the 0x address', () => {
		expect(normalizeSearchInput(SAMPLE_TEMPO_ADDRESS)).toBe(
			SAMPLE_PARSED_ADDRESS,
		)
	})

	it('keeps non-address search terms unchanged', () => {
		expect(normalizeSearchInput('tempo')).toBe('tempo')
	})

	it('returns empty string for empty input', () => {
		expect(normalizeSearchInput('')).toBe('')
		expect(normalizeSearchInput('  ')).toBe('')
	})
})
