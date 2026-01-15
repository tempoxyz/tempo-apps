import { describe, it, expect } from 'vitest'
import {
	verifyStripeSignature,
	parseStripeEvent,
	extractPaymentMetadata,
	extractChargeMetadata,
	getChargeAmountInDollars,
	type StripeEvent,
} from './stripe-webhook'

describe('stripe-webhook', () => {
	describe('verifyStripeSignature', () => {
		it('should return false for missing timestamp', async () => {
			const result = await verifyStripeSignature(
				'{"test": true}',
				'v1=abc123',
				'whsec_test',
			)
			expect(result).toBe(false)
		})

		it('should return false for missing signature', async () => {
			const result = await verifyStripeSignature(
				'{"test": true}',
				't=1234567890',
				'whsec_test',
			)
			expect(result).toBe(false)
		})

		it('should return false for expired timestamp', async () => {
			const oldTimestamp = Math.floor(Date.now() / 1000) - 400
			const result = await verifyStripeSignature(
				'{"test": true}',
				`t=${oldTimestamp},v1=abc123`,
				'whsec_test',
			)
			expect(result).toBe(false)
		})

		it('should return false for invalid signature', async () => {
			const timestamp = Math.floor(Date.now() / 1000)
			const result = await verifyStripeSignature(
				'{"test": true}',
				`t=${timestamp},v1=invalid_signature`,
				'whsec_test',
			)
			expect(result).toBe(false)
		})

		it('should verify valid signature correctly', async () => {
			const payload = '{"test": true}'
			const secret = 'whsec_test_secret'
			const timestamp = Math.floor(Date.now() / 1000)

			const signedPayload = `${timestamp}.${payload}`
			const encoder = new TextEncoder()
			const key = await crypto.subtle.importKey(
				'raw',
				encoder.encode(secret),
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['sign'],
			)
			const signatureBytes = await crypto.subtle.sign(
				'HMAC',
				key,
				encoder.encode(signedPayload),
			)
			const expectedSignature = Array.from(new Uint8Array(signatureBytes))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')

			const result = await verifyStripeSignature(
				payload,
				`t=${timestamp},v1=${expectedSignature}`,
				secret,
			)
			expect(result).toBe(true)
		})
	})

	describe('parseStripeEvent', () => {
		it('should parse valid JSON payload', () => {
			const payload = JSON.stringify({
				id: 'evt_123',
				type: 'payment_intent.succeeded',
				data: {
					object: {
						id: 'pi_123',
						amount: 5000,
						currency: 'usd',
						status: 'succeeded',
						metadata: {
							destinationAddress: '0x123',
							amount: '50',
							environment: 'local',
						},
					},
				},
			})

			const event = parseStripeEvent(payload)
			expect(event.id).toBe('evt_123')
			expect(event.type).toBe('payment_intent.succeeded')
			expect(event.data.object.id).toBe('pi_123')
		})

		it('should throw for invalid JSON', () => {
			expect(() => parseStripeEvent('invalid json')).toThrow()
		})
	})

	describe('extractPaymentMetadata', () => {
		it('should extract metadata from payment_intent.succeeded event', () => {
			const event: StripeEvent = {
				id: 'evt_123',
				type: 'payment_intent.succeeded',
				data: {
					object: {
						id: 'pi_123',
						amount: 5000,
						currency: 'usd',
						status: 'succeeded',
						metadata: {
							destinationAddress: '0x1234567890123456789012345678901234567890',
							amount: '50',
							environment: 'local',
						},
					},
				},
			}

			const metadata = extractPaymentMetadata(event)
			expect(metadata).toEqual({
				destinationAddress: '0x1234567890123456789012345678901234567890',
				amount: '50',
				environment: 'local',
			})
		})

		it('should return null for non-succeeded events', () => {
			const event: StripeEvent = {
				id: 'evt_123',
				type: 'payment_intent.created',
				data: {
					object: {
						id: 'pi_123',
						amount: 5000,
						currency: 'usd',
						status: 'requires_payment_method',
						metadata: {
							destinationAddress: '0x123',
							amount: '50',
							environment: 'local',
						},
					},
				},
			}

			const metadata = extractPaymentMetadata(event)
			expect(metadata).toBeNull()
		})

		it('should return null for missing destinationAddress', () => {
			const event: StripeEvent = {
				id: 'evt_123',
				type: 'payment_intent.succeeded',
				data: {
					object: {
						id: 'pi_123',
						amount: 5000,
						currency: 'usd',
						status: 'succeeded',
						metadata: {
							amount: '50',
							environment: 'local',
						},
					},
				},
			}

			const metadata = extractPaymentMetadata(event)
			expect(metadata).toBeNull()
		})

		it('should return null for missing amount', () => {
			const event: StripeEvent = {
				id: 'evt_123',
				type: 'payment_intent.succeeded',
				data: {
					object: {
						id: 'pi_123',
						amount: 5000,
						currency: 'usd',
						status: 'succeeded',
						metadata: {
							destinationAddress: '0x123',
							environment: 'local',
						},
					},
				},
			}

			const metadata = extractPaymentMetadata(event)
			expect(metadata).toBeNull()
		})
	})

	describe('extractChargeMetadata', () => {
		it('should extract metadata from charge.succeeded event', () => {
			const event: StripeEvent = {
				id: 'evt_123',
				type: 'charge.succeeded',
				data: {
					object: {
						id: 'ch_123',
						amount: 5000,
						currency: 'usd',
						status: 'succeeded',
						paid: true,
						metadata: {
							destinationAddress: '0x1234567890123456789012345678901234567890',
							environment: 'local',
						},
					},
				},
			}

			const metadata = extractChargeMetadata(event)
			expect(metadata).toEqual({
				destinationAddress: '0x1234567890123456789012345678901234567890',
				environment: 'local',
			})
		})

		it('should return null for non-charge events', () => {
			const event: StripeEvent = {
				id: 'evt_123',
				type: 'payment_intent.succeeded',
				data: {
					object: {
						id: 'pi_123',
						amount: 5000,
						currency: 'usd',
						status: 'succeeded',
						metadata: {
							destinationAddress: '0x123',
							environment: 'local',
						},
					},
				},
			}

			const metadata = extractChargeMetadata(event)
			expect(metadata).toBeNull()
		})

		it('should return null for missing destinationAddress', () => {
			const event: StripeEvent = {
				id: 'evt_123',
				type: 'charge.succeeded',
				data: {
					object: {
						id: 'ch_123',
						amount: 5000,
						currency: 'usd',
						status: 'succeeded',
						paid: true,
						metadata: {
							environment: 'local',
						},
					},
				},
			}

			const metadata = extractChargeMetadata(event)
			expect(metadata).toBeNull()
		})
	})

	describe('getChargeAmountInDollars', () => {
		it('should convert cents to dollars for USD charge', () => {
			const event: StripeEvent = {
				id: 'evt_123',
				type: 'charge.succeeded',
				data: {
					object: {
						id: 'ch_123',
						amount: 5000,
						currency: 'usd',
						status: 'succeeded',
						paid: true,
						metadata: {},
					},
				},
			}

			const amount = getChargeAmountInDollars(event)
			expect(amount).toBe(50)
		})

		it('should handle fractional dollar amounts', () => {
			const event: StripeEvent = {
				id: 'evt_123',
				type: 'charge.succeeded',
				data: {
					object: {
						id: 'ch_123',
						amount: 2550,
						currency: 'usd',
						status: 'succeeded',
						paid: true,
						metadata: {},
					},
				},
			}

			const amount = getChargeAmountInDollars(event)
			expect(amount).toBe(25.5)
		})

		it('should return null for non-USD currency', () => {
			const event: StripeEvent = {
				id: 'evt_123',
				type: 'charge.succeeded',
				data: {
					object: {
						id: 'ch_123',
						amount: 5000,
						currency: 'eur',
						status: 'succeeded',
						paid: true,
						metadata: {},
					},
				},
			}

			const amount = getChargeAmountInDollars(event)
			expect(amount).toBeNull()
		})

		it('should return null for non-charge events', () => {
			const event: StripeEvent = {
				id: 'evt_123',
				type: 'payment_intent.succeeded',
				data: {
					object: {
						id: 'pi_123',
						amount: 5000,
						currency: 'usd',
						status: 'succeeded',
						metadata: {},
					},
				},
			}

			const amount = getChargeAmountInDollars(event)
			expect(amount).toBeNull()
		})
	})
})
