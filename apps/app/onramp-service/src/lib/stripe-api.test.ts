import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPaymentIntent } from './stripe-api'

describe('stripe-api', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	describe('createPaymentIntent', () => {
		it('should create a payment intent with correct parameters', async () => {
			const mockResponse = {
				id: 'pi_test_123',
				client_secret: 'pi_test_123_secret_abc',
				amount: 5000,
			}

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			})

			const result = await createPaymentIntent({
				secretKey: 'sk_test_123',
				destinationAddress: '0x1234567890123456789012345678901234567890',
				amount: 50,
				email: 'test@example.com',
				environment: 'local',
			})

			expect(result).toEqual({
				paymentIntentId: 'pi_test_123',
				clientSecret: 'pi_test_123_secret_abc',
				amount: 50,
			})

			expect(fetch).toHaveBeenCalledWith(
				'https://api.stripe.com/v1/payment_intents',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						'Content-Type': 'application/x-www-form-urlencoded',
					}),
				}),
			)
		})

		it('should convert amount to cents', async () => {
			const mockResponse = {
				id: 'pi_test_123',
				client_secret: 'pi_test_123_secret_abc',
				amount: 2500,
			}

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			})

			await createPaymentIntent({
				secretKey: 'sk_test_123',
				destinationAddress: '0x1234567890123456789012345678901234567890',
				amount: 25,
				environment: 'local',
			})

			const fetchCall = vi.mocked(fetch).mock.calls[0]
			const body = fetchCall[1]?.body as string
			expect(body).toContain('amount=2500')
		})

		it('should include metadata in request body', async () => {
			const mockResponse = {
				id: 'pi_test_123',
				client_secret: 'pi_test_123_secret_abc',
				amount: 5000,
			}

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			})

			const address = '0x1234567890123456789012345678901234567890'

			await createPaymentIntent({
				secretKey: 'sk_test_123',
				destinationAddress: address,
				amount: 50,
				environment: 'moderato',
			})

			const fetchCall = vi.mocked(fetch).mock.calls[0]
			const body = fetchCall[1]?.body as string

			expect(body).toContain(`metadata%5BdestinationAddress%5D=${address}`)
			expect(body).toContain('metadata%5Bamount%5D=50')
			expect(body).toContain('metadata%5Benvironment%5D=moderato')
		})

		it('should throw error on API failure', async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				text: () => Promise.resolve('{"error": "Invalid request"}'),
			})

			await expect(
				createPaymentIntent({
					secretKey: 'sk_test_123',
					destinationAddress: '0x1234567890123456789012345678901234567890',
					amount: 50,
					environment: 'local',
				}),
			).rejects.toThrow('Stripe API error: 400')
		})

		it('should include receipt_email when provided', async () => {
			const mockResponse = {
				id: 'pi_test_123',
				client_secret: 'pi_test_123_secret_abc',
				amount: 5000,
			}

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			})

			await createPaymentIntent({
				secretKey: 'sk_test_123',
				destinationAddress: '0x1234567890123456789012345678901234567890',
				amount: 50,
				email: 'user@test.com',
				environment: 'local',
			})

			const fetchCall = vi.mocked(fetch).mock.calls[0]
			const body = fetchCall[1]?.body as string
			expect(body).toContain('receipt_email=user%40test.com')
		})
	})
})
