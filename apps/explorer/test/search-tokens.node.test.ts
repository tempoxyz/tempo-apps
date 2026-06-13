import { describe, expect, it } from 'vitest'
import { searchTokens } from '../src/routes/api/search.ts'

describe('searchTokens', () => {
	it('finds verified tokens missing from the static index by symbol', () => {
		expect(
			searchTokens('BRLA', [
				{
					address: '0x20c000000000000000000000f047dd7018e50367',
					name: 'BRLA Token',
					symbol: 'BRLA',
				},
			]),
		).toEqual([
			{
				type: 'token',
				address: '0x20c000000000000000000000f047dd7018e50367',
				symbol: 'BRLA',
				name: 'BRLA Token',
				isTip20: true,
			},
		])
	})
})
