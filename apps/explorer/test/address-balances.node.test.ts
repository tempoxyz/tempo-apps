import { describe, expect, test } from 'vitest'
import {
	type AssetData,
	calculateTotalHoldings,
	formatAssetValue,
} from '#lib/address-balances'
import { applyEarnPositionValues } from '#lib/server/address-balances'

const shareToken = '0x20c000000000000000000000baac91f6ca72f768'

describe('foreign currency holdings', () => {
	const asset: AssetData = {
		address: shareToken,
		balance: 123_450_000n,
		metadata: { symbol: 'euroToken', currency: 'EUR', decimals: 6 },
		valuation: undefined,
	}

	test('uses the declared currency instead of the token symbol or USD', () => {
		expect(formatAssetValue(asset)).toBe('123.45 EUR')
		expect(calculateTotalHoldings([asset])).toBeUndefined()
	})

	test('preserves USD formatting and keeps foreign values out of USD totals', () => {
		const usd = { ...asset, metadata: { currency: 'USD', decimals: 6 } }
		expect(formatAssetValue(usd)).toBe('$123.45')
		expect(calculateTotalHoldings([asset, usd])).toBe(123.45)
	})

	test('uses the currency and decimals of an explicit underlying valuation', () => {
		expect(
			formatAssetValue({
				...asset,
				valuation: { amount: 24_690n, decimals: 2, currency: 'GBP' },
			}),
		).toBe('246.9 GBP')
	})

	test('handles small, zero, and compact foreign currency values', () => {
		expect(formatAssetValue({ ...asset, balance: 1n })).toBe('<0.01 EUR')
		expect(formatAssetValue({ ...asset, balance: 0n })).toBe('0 EUR')
		expect(formatAssetValue({ ...asset, balance: 1_234_560_000n })).toBe(
			'1.23K EUR',
		)
	})

	test('does not invent a value when metadata or balance is unavailable', () => {
		expect(formatAssetValue({ ...asset, metadata: undefined })).toBeUndefined()
		expect(formatAssetValue({ ...asset, balance: undefined })).toBeUndefined()
		expect(
			formatAssetValue({ ...asset, metadata: { currency: '', decimals: 6 } }),
		).toBeUndefined()
	})
})

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
