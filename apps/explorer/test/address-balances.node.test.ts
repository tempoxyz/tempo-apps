import { describe, expect, test } from 'vitest'
import { type AssetData, calculateTotalHoldings } from '#lib/address-balances'
import { applyEarnPositionValues } from '#lib/server/address-balances'

const shareToken = '0x20c000000000000000000000baac91f6ca72f768'

describe('Earn share valuations', () => {
	test('uses the underlying asset value for holdings totals', () => {
		const assets: AssetData[] = [
			{
				address: shareToken,
				balance: 2_497_405_051n,
				metadata: { currency: 'USD', decimals: 6 },
				valuation: {
					amount: 4_992_789_782n,
					currency: 'USD',
					decimals: 6,
				},
			},
		]

		expect(calculateTotalHoldings(assets)).toBe(4_992.789782)
	})

	test('attaches API-computed values to matching share-token balances', () => {
		const [balance] = applyEarnPositionValues(
			[
				{
					token: shareToken,
					balance: '2497405051',
					currency: 'USD',
					decimals: 6,
				},
			],
			[
				{
					assetAmount: {
						amount: '4992789782',
						currency: 'USD',
						decimals: 6,
					},
					shareToken: { address: shareToken },
				},
			],
		)

		expect(balance?.valuation).toEqual({
			amount: '4992789782',
			currency: 'USD',
			decimals: 6,
		})
	})
})
