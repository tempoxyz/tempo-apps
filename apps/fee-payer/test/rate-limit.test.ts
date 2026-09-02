import { env, exports } from 'cloudflare:workers'
import { TxEnvelopeTempo } from 'ox/tempo'
import { describe, expect, it } from 'vitest'
import { pathUsd } from '../src/lib/consts.js'
import { tempoChain } from './helpers.js'

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

	it('rate limits serialized sponsorship requests by client IP', {
		timeout: 30_000,
	}, async () => {
		const clientIp = '203.0.113.2'
		for (let index = 0; index < 1_000; index++)
			await env.AddressRateLimiter.limit({ key: clientIp })

		const serialized = TxEnvelopeTempo.serialize(
			TxEnvelopeTempo.from({
				accessList: [],
				authorizationList: [],
				calls: [
					{
						to: '0x0000000000000000000000000000000000000002',
						value: 0n,
						data: '0x',
					},
				],
				chainId: tempoChain.id,
				feeToken: pathUsd,
				gas: 21_000n,
				maxFeePerGas: 1n,
				maxPriorityFeePerGas: 0n,
				nonce: 0n,
				nonceKey: 0n,
				validBefore: Math.floor(Date.now() / 1_000) + 60,
			}),
		)
		const response = await exports.default.fetch(
			new Request('https://fee-payer.test/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'CF-Connecting-IP': clientIp,
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_signRawTransaction',
					params: [serialized],
				}),
			}),
		)

		expect(response.status).toBe(429)
		await expect(response.json()).resolves.toEqual({
			error: 'Rate limit exceeded',
		})
	})
})
