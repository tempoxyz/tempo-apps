import { describe, expect, it } from 'vitest'
import { sortTokensByCirculatingSupply } from '#lib/server/tokens'

describe('sortTokensByCirculatingSupply', () => {
	it('ranks USD tokens by supply, then other currencies, then unknown supply', () => {
		const tokens = [
			{ symbol: 'NONE', currency: 'USD', circulatingSupply: undefined },
			{ symbol: 'EURC', currency: 'EUR', circulatingSupply: '1421704.5' },
			{ symbol: 'SMALL', currency: 'USD', circulatingSupply: '1120' },
			{ symbol: 'BIG', currency: 'USD', circulatingSupply: '434195711.25' },
			{ symbol: 'BRLA', currency: 'BRL', circulatingSupply: '50100' },
			{ symbol: 'MID', currency: 'USD', circulatingSupply: '87278935' },
		]

		expect(
			sortTokensByCirculatingSupply(tokens).map((token) => token.symbol),
		).toEqual(['BIG', 'MID', 'SMALL', 'EURC', 'BRLA', 'NONE'])
	})

	it('keeps input order for equal supplies', () => {
		const tokens = [
			{ symbol: 'A', currency: 'USD', circulatingSupply: '10' },
			{ symbol: 'B', currency: 'USD', circulatingSupply: '10' },
		]

		expect(
			sortTokensByCirculatingSupply(tokens).map((token) => token.symbol),
		).toEqual(['A', 'B'])
	})
})
