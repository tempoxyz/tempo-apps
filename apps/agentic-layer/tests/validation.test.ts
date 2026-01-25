import { describe, it, expect } from 'vitest'
import {
	isValidAddress,
	isValidTxHash,
	validateGateConfig,
	redactConfig,
	PaymentConfigError,
} from '@tempo/402-common'

describe('Validation utilities', () => {
	describe('isValidAddress', () => {
		it('should validate correct Ethereum addresses', () => {
			expect(isValidAddress('0x20c0000000000000000000000000000000000001')).toBe(
				true,
			)
			expect(isValidAddress(`0x${'a'.repeat(40)}`)).toBe(true)
		})

		it('should reject invalid addresses', () => {
			expect(isValidAddress('invalid')).toBe(false)
			expect(isValidAddress(`0x${'a'.repeat(39)}`)).toBe(false) // Too short
			expect(isValidAddress(`0x${'a'.repeat(41)}`)).toBe(false) // Too long
			expect(isValidAddress(`0x${'G'.repeat(40)}`)).toBe(false) // Non-hex
		})
	})

	describe('isValidTxHash', () => {
		it('should validate correct transaction hashes', () => {
			expect(isValidTxHash(`0x${'1'.repeat(64)}`)).toBe(true)
		})

		it('should reject invalid transaction hashes', () => {
			expect(isValidTxHash(`0x${'1'.repeat(63)}`)).toBe(false)
			expect(isValidTxHash('invalid')).toBe(false)
		})
	})

	describe('validateGateConfig', () => {
		it('should accept a valid configuration', () => {
			expect(() =>
				validateGateConfig({
					recipient: '0x20c0000000000000000000000000000000000001',
					amount: '1000',
					token: '0x20c0000000000000000000000000000000000001',
					rpcUrl: 'https://rpc.testnet.com',
				}),
			).not.toThrow()
		})

		it('should throw PaymentConfigError for invalid recipient', () => {
			expect(() => validateGateConfig({ recipient: '0xinvalid' })).toThrow(
				PaymentConfigError,
			)
		})

		it('should throw PaymentConfigError for negative amount', () => {
			expect(() => validateGateConfig({ amount: '-100' })).toThrow(
				PaymentConfigError,
			)
		})

		it('should throw PaymentConfigError for non-numeric amount', () => {
			expect(() => validateGateConfig({ amount: 'abc' })).toThrow(
				PaymentConfigError,
			)
		})

		it('should throw PaymentConfigError for invalid rpcUrl', () => {
			expect(() => validateGateConfig({ rpcUrl: 'not-a-url' })).toThrow(
				PaymentConfigError,
			)
		})
	})

	describe('redactConfig', () => {
		it('should redact sensitive keys and leave others intact', () => {
			const config = {
				privateKey: '0xsecret',
				agentPrivateKey: '0xagentsecret',
				recipient: '0xpublic',
				amount: '100',
			}
			const redacted = redactConfig(config)

			expect(redacted.redactedPrivateKey).toBe('[REDACTED]')
			expect(redacted.redactedAgentPrivateKey).toBe('[REDACTED]')
			expect(redacted.recipient).toBe('0xpublic')
			expect(redacted.amount).toBe('100')
		})

		it('should return a new object and not mutate original', () => {
			const config = { privateKey: '0x123' }
			const redacted = redactConfig(config)
			expect(redacted).not.toBe(config)
			expect(config.privateKey).toBe('0x123')
		})
	})
})
