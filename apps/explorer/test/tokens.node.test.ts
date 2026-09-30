import { describe, expect, it } from 'vitest'
import { sortTokensByAop } from '#lib/server/tokens'

describe('sortTokensByAop', () => {
	it('ranks USD tokens by supply, then other currencies, then unknown supply', () => {
		const tokens = [
			{ symbol: 'NONE', currency: 'USD', aop: undefined },
			{ symbol: 'EURC', currency: 'EUR', aop: '1421704.5' },
			{ symbol: 'SMALL', currency: 'USD', aop: '1120' },
			{ symbol: 'BIG', currency: 'USD', aop: '434195711.25' },
			{ symbol: 'BRLA', currency: 'BRL', aop: '50100' },
			{ symbol: 'MID', currency: 'USD', aop: '87278935' },
		]

		expect(sortTokensByAop(tokens).map((token) => token.symbol)).toEqual([
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
			{ symbol: 'A', currency: 'USD', aop: '10' },
			{ symbol: 'B', currency: 'USD', aop: '10' },
		]

		expect(sortTokensByAop(tokens).map((token) => token.symbol)).toEqual([
			'A',
			'B',
		])
	})
})
