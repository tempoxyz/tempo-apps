import { describe, expect, it } from 'vitest'
import { FAUCET_TOKENS } from '../src/lib/constants'

describe('FAUCET_TOKENS', () => {
	it('should have exactly 4 tokens', () => {
		expect(FAUCET_TOKENS).toHaveLength(4)
	})

	it('should have correct token names', () => {
		const names = FAUCET_TOKENS.map((t) => t.name)
		expect(names).toEqual(['pathUSD', 'AlphaUSD', 'BetaUSD', 'ThetaUSD'])
	})

	it('should have valid Ethereum addresses', () => {
		for (const token of FAUCET_TOKENS) {
			expect(token.address).toMatch(/^0x[0-9a-f]{40}$/i)
		}
	})

	it('should have correct addresses', () => {
		expect(FAUCET_TOKENS[0].address).toBe(
			'0x20c0000000000000000000000000000000000000',
		)
		expect(FAUCET_TOKENS[1].address).toBe(
			'0x20c0000000000000000000000000000000000001',
		)
		expect(FAUCET_TOKENS[2].address).toBe(
			'0x20c0000000000000000000000000000000000002',
		)
		expect(FAUCET_TOKENS[3].address).toBe(
			'0x20c0000000000000000000000000000000000003',
		)
	})

	it('should have correct amount format', () => {
		for (const token of FAUCET_TOKENS) {
			expect(token.amount).toBe('1,000,000')
		}
	})

	it('should have all required properties', () => {
		for (const token of FAUCET_TOKENS) {
			expect(token).toHaveProperty('name')
			expect(token).toHaveProperty('symbol')
			expect(token).toHaveProperty('address')
			expect(token).toHaveProperty('amount')
		}
	})
})
