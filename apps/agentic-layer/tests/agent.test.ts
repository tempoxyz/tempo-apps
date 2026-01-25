import { describe, it, expect } from 'vitest'
import { Agent, TempoAgent, PaymentFailureError } from '@tempo/402-sdk'
import { ConsoleLogger, SilentLogger } from '@tempo/402-common'

describe('Agent', () => {
	describe('Constructor Validation', () => {
		it('should throw error if both privateKey and walletClient are missing', () => {
			expect(() => new Agent({ privateKey: '' } as any)).toThrow(
				'Either privateKey or walletClient is required',
			)
		})

		it('should throw error if privateKey format is invalid', () => {
			expect(() => new Agent({ privateKey: 'invalid' })).toThrow(
				'Invalid privateKey format',
			)
			expect(() => new Agent({ privateKey: '0x123' })).toThrow(
				'Invalid privateKey format',
			)
		})

		it('should throw error if rpcUrl format is invalid', () => {
			const validKey = `0x${'1'.repeat(64)}`
			expect(
				() =>
					new Agent({
						privateKey: validKey,
						rpcUrl: 'invalid-url',
					}),
			).toThrow('Invalid rpcUrl format')
		})

		it('should throw error if feeToken address is invalid', () => {
			const validKey = `0x${'1'.repeat(64)}`
			expect(
				() =>
					new Agent({
						privateKey: validKey,
						feeToken: 'invalid-address',
					}),
			).toThrow('Invalid feeToken address')
		})

		it('should accept valid configuration with privateKey', () => {
			const validKey = `0x${'1'.repeat(64)}`
			expect(
				() =>
					new Agent({
						privateKey: validKey,
						logger: new SilentLogger(),
					}),
			).not.toThrow()
		})

		it('should accept valid configuration with walletClient', () => {
			const mockWalletClient = { chain: { id: 1 } } as any
			expect(
				() =>
					new Agent({
						walletClient: mockWalletClient,
						logger: new SilentLogger(),
					}),
			).not.toThrow()
		})

		it('should use custom logger', () => {
			const validKey = `0x${'1'.repeat(64)}`
			const customLogger = new ConsoleLogger('error')
			const agent = new Agent({
				privateKey: validKey,
				logger: customLogger,
			})
			expect(agent).toBeDefined()
		})

		it('should use default timeout if not provided', () => {
			const validKey = `0x${'1'.repeat(64)}`
			const agent = new Agent({
				privateKey: validKey,
				logger: new SilentLogger(),
			})
			expect(agent).toBeDefined()
		})
	})

	describe('TempoAgent alias', () => {
		it('should be the same as Agent', () => {
			expect(TempoAgent).toBe(Agent)
		})
	})

	describe('PaymentFailureError', () => {
		it('should preserve original error stack', () => {
			const originalError = new Error('Original error')
			const paymentError = new PaymentFailureError(
				'Payment failed',
				originalError,
			)

			expect(paymentError.message).toBe('Payment failed')
			expect(paymentError.name).toBe('PaymentFailureError')
			expect(paymentError.originalError).toBe(originalError)
			expect(paymentError.stack).toContain('Caused by:')
		})

		it('should work without original error', () => {
			const paymentError = new PaymentFailureError('Payment failed')
			expect(paymentError.message).toBe('Payment failed')
			expect(paymentError.originalError).toBeUndefined()
		})
	})
})
