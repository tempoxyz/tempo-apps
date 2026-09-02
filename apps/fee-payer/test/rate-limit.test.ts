import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

type JsonRpcRequest = {
	jsonrpc: '2.0'
	id: number
	method: string
	params?: unknown[] | undefined
}

function request(body: JsonRpcRequest, clientIp = '203.0.113.1'): Request {
	return new Request('https://fee-payer.test/', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'CF-Connecting-IP': clientIp,
		},
		body: JSON.stringify(body),
	})
}

describe('rate-limit middleware', () => {
	it('returns 400 for malformed transaction data', {
		timeout: 30_000,
	}, async () => {
		const response = await exports.default.fetch(
			new Request('https://fee-payer.test/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_signRawTransaction',
					params: ['0x76deadbeef'],
				}),
			}),
		)

		expect(response.status).toBe(400)
		const data = (await response.json()) as { error?: string }
		expect(data.error).toBe('Bad request')
	})

	it('returns 400 for malformed JSON body', async () => {
		const response = await exports.default.fetch(
			new Request('https://fee-payer.test/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not json',
			}),
		)

		expect(response.status).toBe(400)
		const data = (await response.json()) as { error?: string }
		expect(data.error).toBe('Bad request')
	})

	it('passes through non-transaction RPC methods', async () => {
		const response = await exports.default.fetch(
			new Request('https://fee-payer.test/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_chainId',
				}),
			}),
		)

		// Should reach the handler (not blocked by rate limiting)
		expect(response.status).toBe(200)
	})

	it('rejects external fee payer URLs', async () => {
		const response = await exports.default.fetch(
			request({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_fillTransaction',
				params: [
					{
						feePayer: 'https://example.com',
						from: '0x0000000000000000000000000000000000000001',
						to: '0x0000000000000000000000000000000000000002',
					},
				],
			}),
		)

		expect(response.status).toBe(400)
		await expect(response.json()).resolves.toEqual({
			error: 'External fee payer URLs are not allowed',
		})
	})

	it('rate limits object-form fill requests by client IP', {
		timeout: 30_000,
	}, async () => {
		const clientIp = '203.0.113.2'
		for (let index = 0; index < 1_000; index++)
			await env.AddressRateLimiter.limit({ key: clientIp })

		const response = await exports.default.fetch(
			request(
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_fillTransaction',
					params: [
						{
							feePayer: true,
							from: '0x0000000000000000000000000000000000000001',
							to: '0x0000000000000000000000000000000000000002',
						},
					],
				},
				clientIp,
			),
		)

		expect(response.status).toBe(429)
		await expect(response.json()).resolves.toEqual({
			error: 'Rate limit exceeded',
		})
	})
})
