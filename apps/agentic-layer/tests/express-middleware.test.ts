import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createPaymentGate } from '../packages/server/src/express-middleware'
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

describe('Express Middleware Tests', () => {
	const RECIPIENT = '0x1234567890123456789012345678901234567890'
	const TOKEN = '0x0987654321098765432109876543210987654321'
	const GOOD_HASH =
		'0x1111111111111111111111111111111111111111111111111111111111111111'
	const RPC_URL = 'https://rpc.moderato.tempo.xyz'

	let app: express.Express

	const config = {
		recipient: RECIPIENT,
		amount: '1000',
		token: TOKEN,
		rpcUrl: RPC_URL,
	}

	beforeEach(() => {
		vi.clearAllMocks()
		app = express()
		app.use(express.json())

		// Protected route with middleware
		app.get('/protected', createPaymentGate(config), (_req, res) => {
			res.json({ success: true, data: 'premium content' })
		})
	})

	it('should return 402 with correct headers when no payment is provided', async () => {
		const res = await request(app).get('/protected')

		expect(res.status).toBe(402)
		expect(res.headers['www-authenticate']).toContain('Tempo')
		expect(res.headers['www-authenticate']).toContain(RECIPIENT)

		expect(res.body.error).toBe('Payment Required')
	})

	it('should return 400 for invalid transaction hash format', async () => {
		const res = await request(app)
			.get('/protected')
			.set('Authorization', 'Tempo 0xinvalid')

		expect(res.status).toBe(400)
		expect(res.body.code).toBe('INVALID_TX_HASH')
	})

	it('should return 402 with REPLAY_ERROR when a transaction is reused', async () => {
		mockVerifyPaymentHash.mockResolvedValue(true)

		// First request succeeds
		const res1 = await request(app)
			.get('/protected')
			.set('Authorization', `Tempo ${GOOD_HASH}`)
		expect(res1.status).toBe(200)

		// Second request with same hash fails
		const res2 = await request(app)
			.get('/protected')
			.set('Authorization', `Tempo ${GOOD_HASH}`)
		expect(res2.status).toBe(402)
		expect(res2.body.code).toBe('REPLAY_ERROR')
	})

	it('should return 503 with NETWORK_ERROR when verification infra fails', async () => {
		mockVerifyPaymentHash.mockRejectedValue(new Error('RPC Error'))

		const res = await request(app)
			.get('/protected')
			.set('Authorization', `Tempo ${GOOD_HASH}`)

		expect(res.status).toBe(503)
		expect(res.body.code).toBe('NETWORK_ERROR')
	})

	it('should return 200 when verification succeeds', async () => {
		mockVerifyPaymentHash.mockResolvedValue(true)

		const res = await request(app)
			.get('/protected')
			.set('Authorization', `Tempo ${GOOD_HASH}`)

		expect(res.status).toBe(200)
		expect(res.body.success).toBe(true)
	})
})
