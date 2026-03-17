import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('rate-limit middleware', () => {
	it('returns 400 for malformed transaction data', async () => {
		const response = await SELF.fetch('https://fee-payer.test/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_signRawTransaction',
				params: ['0x76deadbeef'],
			}),
		})

		expect(response.status).toBe(400)
		const data = (await response.json()) as { error?: string }
		expect(data.error).toBe('Bad request')
	})

	it('returns 400 for malformed JSON body', async () => {
		const response = await SELF.fetch('https://fee-payer.test/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not json',
		})

		expect(response.status).toBe(400)
		const data = (await response.json()) as { error?: string }
		expect(data.error).toBe('Bad request')
	})

	it('passes through non-transaction RPC methods', async () => {
		const response = await SELF.fetch('https://fee-payer.test/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_chainId',
			}),
		})

		// Should reach the handler (not blocked by rate limiting)
		expect(response.status).toBe(200)
	})
})
