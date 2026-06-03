import { describe, expect, it } from 'vitest'
import { isUsdPricedToken } from '#lib/pricing'

const chainId = 4217
const token = `0x${'1'.repeat(40)}` as const
const isTokenListed = () => true

describe('isUsdPricedToken', () => {
	it('does not treat separately quoted TIP-20 tokens as USD-denominated', () => {
		expect(
			isUsdPricedToken(
				chainId,
				{
					currency: 'USD',
					quoteToken: `0x${'2'.repeat(40)}`,
					symbol: 'senpathusd',
					token,
				},
				isTokenListed,
			),
		).toBe(false)
	})

	it('keeps listed USD stable tokens without quote tokens USD-priced', () => {
		expect(
			isUsdPricedToken(
				chainId,
				{ currency: 'USD', symbol: 'pathUSD', token },
				isTokenListed,
			),
		).toBe(true)
	})

	it('keeps self-quoted listed USD tokens USD-priced', () => {
		expect(
			isUsdPricedToken(
				chainId,
				{ currency: 'USD', quoteToken: token, symbol: 'USDC', token },
				isTokenListed,
			),
		).toBe(true)
	})
})
