import { describe, expect, it } from 'vitest'
import { mapFeeAmmPools } from '#lib/server/fee-amm'

describe('mapFeeAmmPools', () => {
	it('maps reserve amounts separately from token metadata', () => {
		const [pool] = mapFeeAmmPools([
			{
				createdAt: '2026-07-22T00:00:00.000Z',
				id: `0x${'11'.repeat(32)}`,
				lastMintAt: '2026-07-22T01:00:00.000Z',
				mintCount: 2,
				poolId: `0x${'11'.repeat(32)}`,
				userAmount: {
					baseUnits: '1250000',
					currency: 'USD',
					decimals: 6,
					formatted: '1.25',
				},
				userToken: {
					address: `0x${'22'.repeat(20)}`,
					currency: 'USD',
					decimals: 6,
					name: 'Alpha USD',
					symbol: 'aUSD',
				},
				validatorAmount: {
					baseUnits: '2500000',
					currency: 'USD',
					decimals: 6,
					formatted: '2.5',
				},
				validatorToken: {
					address: `0x${'33'.repeat(20)}`,
					currency: 'USD',
					decimals: 6,
					name: 'Beta USD',
					symbol: 'bUSD',
				},
			},
		])

		expect(pool).toMatchInlineSnapshot(`
			{
			  "createdAt": 1784678400,
			  "latestMintAt": 1784682000,
			  "liquidityUsd": 3.75,
			  "mintCount": 2,
			  "poolId": "0x1111111111111111111111111111111111111111111111111111111111111111",
			  "reserveUserToken": 1250000n,
			  "reserveValidatorToken": 2500000n,
			  "userToken": "0x2222222222222222222222222222222222222222",
			  "userTokenDecimals": 6,
			  "userTokenName": "Alpha USD",
			  "userTokenSymbol": "aUSD",
			  "validatorToken": "0x3333333333333333333333333333333333333333",
			  "validatorTokenDecimals": 6,
			  "validatorTokenName": "Beta USD",
			  "validatorTokenSymbol": "bUSD",
			}
		`)
	})
})
