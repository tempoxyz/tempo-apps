import { tempo, tempoModerato } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { getTokenDisplayName } from '#lib/domain/token-display'

const OUSD_ADDRESS = '0x20c0000000000000000000006a37da5c996874be'

describe('getTokenDisplayName', () => {
	it('displays the branded OUSD name on mainnet', () => {
		expect(getTokenDisplayName(tempo.id, OUSD_ADDRESS, 'OpenUSD')).toBe(
			'Open USD',
		)
	})

	it('matches the token address case-insensitively', () => {
		expect(
			getTokenDisplayName(tempo.id, OUSD_ADDRESS.toUpperCase(), 'OpenUSD'),
		).toBe('Open USD')
	})

	it('leaves the same address on other chains unchanged', () => {
		expect(getTokenDisplayName(tempoModerato.id, OUSD_ADDRESS, 'OpenUSD')).toBe(
			'OpenUSD',
		)
	})

	it('leaves other tokens unchanged even if their names match', () => {
		expect(
			getTokenDisplayName(
				tempo.id,
				'0x20c0000000000000000000000000000000000000',
				'OpenUSD',
			),
		).toBe('OpenUSD')
	})
})
