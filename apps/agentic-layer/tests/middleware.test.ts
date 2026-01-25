import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { fourZeroTwo } from '../packages/server/src/hono-middleware'
import type { HonoGateConfig } from '../packages/server/src/hono-middleware'
import { verifyPaymentHash } from '@tempo/402-common'

// Mock common module
vi.mock('@tempo/402-common', async () => {
	const actual = (await vi.importActual('@tempo/402-common')) as any
	return {
		...actual,
		verifyPaymentHash: vi.fn(),
	}
})
const mockVerifyPaymentHash = verifyPaymentHash as unknown as {
	mockResolvedValue: (v: any) => void
	mockRejectedValue: (e: Error) => void
}

describe('Hono Middleware Tests', () => {
	const RECIPIENT = '0x1234567890123456789012345678901234567890'
	const TOKEN = '0x0987654321098765432109876543210987654321'
	const GOOD_HASH =
		'0x1111111111111111111111111111111111111111111111111111111111111111'
	const RPC_URL = 'https://rpc.moderato.tempo.xyz'

	let app: Hono

	const config: HonoGateConfig = {
		recipient: RECIPIENT,
		amount: '1000',
		token: TOKEN,
		rpcUrl: RPC_URL,
	}

	beforeEach(() => {
		vi.clearAllMocks()
		app = new Hono()

		// Protected route with middleware
		app.get('/protected', fourZeroTwo(config), (c) => {
			return c.json({ success: true, data: 'premium content' })
		})
	})

	it('should return 402 with correct headers when no payment is provided', async () => {
		const res = await app.request('/protected')

		expect(res.status).toBe(402)
		expect(res.headers.get('WWW-Authenticate')).toContain('Tempo')
		expect(res.headers.get('WWW-Authenticate')).toContain(RECIPIENT)

		const body = await res.json()
		expect(body.error).toBe('Payment Required')
		expect(body.paymentInfo).toBeDefined()
		expect(body.paymentInfo.recipient).toBe(RECIPIENT)
		expect(body.paymentInfo.amount).toBe('1000')
	})

	it('should return 402 when Authorization header is not Tempo format', async () => {
		const res = await app.request('/protected', {
			headers: { Authorization: 'Bearer some-token' },
		})

		expect(res.status).toBe(402)
	})

	it('should return 402 when verification fails', async () => {
		mockVerifyPaymentHash.mockResolvedValue(false)

		const res = await app.request('/protected', {
			headers: { Authorization: `Tempo ${GOOD_HASH}` },
		})

		expect(res.status).toBe(402)
		expect(mockVerifyPaymentHash).toHaveBeenCalledWith(
			GOOD_HASH,
			expect.objectContaining({
				recipient: RECIPIENT,
				amount: '1000',
				token: TOKEN,
			}),
		)
	})

	it('should return 200 when verification succeeds', async () => {
		mockVerifyPaymentHash.mockResolvedValue(true)

		const res = await app.request('/protected', {
			headers: { Authorization: `Tempo ${GOOD_HASH}` },
		})

		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.success).toBe(true)
		expect(body.data).toBe('premium content')
	})

	it('should use default ALPHA_USD token when not specified', async () => {
		const appWithDefaults = new Hono()
		appWithDefaults.get(
			'/test',
			fourZeroTwo({
				recipient: RECIPIENT,
				amount: '500',
				rpcUrl: RPC_URL,
				// token not specified - should default to ALPHA_USD
			}),
			(c) => c.json({ ok: true }),
		)

		const res = await appWithDefaults.request('/test')

		expect(res.status).toBe(402)
		const body = await res.json()
		// Default token should be ALPHA_USD_ADDRESS
		expect(body.paymentInfo.token).toBe(
			'0x20c0000000000000000000000000000000000001',
		)
	})

	it('should include correct payment info in 402 response', async () => {
		const res = await app.request('/protected')
		const body = await res.json()

		expect(body.paymentInfo).toEqual({
			method: 'tempo',
			recipient: RECIPIENT,
			amount: '1000',
			token: TOKEN,
		})
	})
})
