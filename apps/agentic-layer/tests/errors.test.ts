import { describe, it, expect } from 'vitest'
import {
	TempoError,
	PaymentConfigError,
	PaymentVerificationError,
	NetworkError,
	ReplayError,
} from '@tempo/402-common'

describe('Error classes', () => {
	describe('TempoError', () => {
		it('should correctly capture and serialize error details', () => {
			const context = { foo: 'bar' }
			const error = new TempoError(
				'Test message',
				'TEST_CODE',
				context,
				'Try fixing it',
				'https://docs.com',
			)

			expect(error.message).toBe('Test message')
			expect(error.code).toBe('TEST_CODE')
			expect(error.context).toEqual(context)
			expect(error.fix).toBe('Try fixing it')
			expect(error.docsUrl).toBe('https://docs.com')
			expect(error.name).toBe('TempoError')
		})

		it('should serialize to a standardized JSON format', () => {
			const error = new TempoError('Message', 'CODE')
			const json = error.toJSON()

			expect(json).toEqual({
				name: 'TempoError',
				message: 'Message',
				code: 'CODE',
				context: undefined,
				fix: undefined,
				docsUrl: undefined,
			})
		})
	})

	describe('PaymentConfigError', () => {
		it('should have the correct predefined error code', () => {
			const error = new PaymentConfigError('Invalid recipient')
			expect(error.code).toBe('PAYMENT_CONFIG_ERROR')
		})
	})

	describe('PaymentVerificationError', () => {
		it('should include the transaction hash in its context', () => {
			const hash = '0x123'
			const error = new PaymentVerificationError('Verification failed', hash)
			expect(error.code).toBe('PAYMENT_VERIFICATION_ERROR')
			expect(error.context?.txHash).toBe(hash)
		})
	})

	describe('NetworkError', () => {
		it('should describe common RPC/network failure scenarios', () => {
			const error = new NetworkError('Gateway timeout')
			expect(error.code).toBe('NETWORK_ERROR')
			expect(error.message).toBe('Gateway timeout')
		})
	})

	describe('ReplayError', () => {
		it('should provide actionable advice for replay detections', () => {
			const hash = '0xabc'
			const error = new ReplayError(hash)
			expect(error.code).toBe('REPLAY_ERROR')
			expect(error.context?.txHash).toBe(hash)
			expect(error.fix).toContain('Generate a new transaction')
		})
	})
})
