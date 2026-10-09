import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
	type AssetData,
	balancesQueryOptions,
	calculateTotalHoldings,
} from '#lib/address-balances'
import { applyEarnPositionValues } from '#lib/server/address-balances'

const shareToken = '0x20c000000000000000000000baac91f6ca72f768'

vi.mock('#lib/env.ts', () => ({ getApiUrl: (path: string) => path }))

afterEach(() => vi.unstubAllGlobals())

describe('balance queries', () => {
	test.each([
		Response.json(
			{ balances: [], error: 'upstream unavailable' },
			{ status: 500 },
		),
		new Response('Bad Gateway', { status: 502 }),
	])('rejects HTTP failures instead of caching empty balances', async (response) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		})
		const options = balancesQueryOptions(shareToken)
		try {
			await expect(client.fetchQuery(options)).rejects.toThrow(
				`Failed to fetch address balances: ${response.status}`,
			)
			expect(client.getQueryState(options.queryKey)?.status).toBe('error')
			expect(client.getQueryData(options.queryKey)).toBeUndefined()
		} finally {
			client.clear()
		}
	})

	test('preserves successful balance data', async () => {
		const data = { balances: [{ token: shareToken, balance: '42' }] }
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)))
		await expect(balancesQueryOptions(shareToken).queryFn()).resolves.toEqual(
			data,
		)
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
