import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { fourZeroTwo } from '../packages/server/src/hono-middleware'
import { verifyPaymentHash } from '@tempo/402-common'

// Mock common
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

	const config = {
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

		const body = (await res.json()) as any
		expect(body.error).toBe('Payment Required')
	})

	it('should return 400 for invalid transaction hash format', async () => {
		const res = await app.request('/protected', {
			headers: { Authorization: 'Tempo 0xinvalid' },
		})
		expect(res.status).toBe(400)
		const body = (await res.json()) as any
		expect(body.code).toBe('INVALID_TX_HASH')
	})

	it('should return 402 with REPLAY_ERROR when a transaction is reused', async () => {
		mockVerifyPaymentHash.mockResolvedValue(true)

		// First request succeeds
		const res1 = await app.request('/protected', {
			headers: { Authorization: `Tempo ${GOOD_HASH}` },
		})
		expect(res1.status).toBe(200)

		// Second request with same hash fails (Replay detected)
		const res2 = await app.request('/protected', {
			headers: { Authorization: `Tempo ${GOOD_HASH}` },
		})
		expect(res2.status).toBe(402)
		const body = (await res2.json()) as any
		expect(body.code).toBe('REPLAY_ERROR')
	})

	it('should return 503 with NETWORK_ERROR when verification infra fails', async () => {
		mockVerifyPaymentHash.mockRejectedValue(new Error('RPC Down'))

		const res = await app.request('/protected', {
			headers: { Authorization: `Tempo ${GOOD_HASH}` },
		})

		expect(res.status).toBe(503)
		const body = (await res.json()) as any
		expect(body.code).toBe('NETWORK_ERROR')
	})

	it('should return 402 when verification fails', async () => {
		mockVerifyPaymentHash.mockResolvedValue(false)

		const res = await app.request('/protected', {
			headers: { Authorization: `Tempo ${GOOD_HASH}` },
		})

		expect(res.status).toBe(402)
	})

	it('should return 200 when verification succeeds', async () => {
		mockVerifyPaymentHash.mockResolvedValue(true)

		const res = await app.request('/protected', {
			headers: { Authorization: `Tempo ${GOOD_HASH}` },
		})

		expect(res.status).toBe(200)
		const body = (await res.json()) as any
		expect(body.success).toBe(true)
	})
})
