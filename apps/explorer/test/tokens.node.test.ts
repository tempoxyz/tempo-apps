import { describe, expect, it } from 'vitest'
import { sortTokensByLiquidity } from '#lib/server/tokens'

describe('sortTokensByLiquidity', () => {
	it('ranks USD tokens by supply, then other currencies, then unknown supply', () => {
		const tokens = [
			{ symbol: 'NONE', currency: 'USD', liquidity: undefined },
			{ symbol: 'EURC', currency: 'EUR', liquidity: '1421704.5' },
			{ symbol: 'SMALL', currency: 'USD', liquidity: '1120' },
			{ symbol: 'BIG', currency: 'USD', liquidity: '434195711.25' },
			{ symbol: 'BRLA', currency: 'BRL', liquidity: '50100' },
			{ symbol: 'MID', currency: 'USD', liquidity: '87278935' },
		]

		expect(sortTokensByLiquidity(tokens).map((token) => token.symbol)).toEqual([
			'BIG',
			'MID',
			'SMALL',
			'EURC',
			'BRLA',
			'NONE',
		])
	})

	it('keeps input order for equal supplies', () => {
		const tokens = [
			{ symbol: 'A', currency: 'USD', liquidity: '10' },
			{ symbol: 'B', currency: 'USD', liquidity: '10' },
		]

		expect(sortTokensByLiquidity(tokens).map((token) => token.symbol)).toEqual([
			'A',
			'B',
		])
	})
})
