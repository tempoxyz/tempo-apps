import { env, SELF } from 'cloudflare:test'
import { Mnemonic } from 'ox'
import { createClient, custom } from 'viem'
import { sendTransactionSync } from 'viem/actions'
import { tempoLocalnet } from 'viem/chains'
import { Account, withFeePayer } from 'viem/tempo'
import { beforeAll, describe, expect, it } from 'vitest'

// Test accounts (same mnemonic as viem tests)
const testMnemonic =
	'test test test test test test test test test test test junk'

const userAccount = Account.fromSecp256k1(
	Mnemonic.toPrivateKey(testMnemonic, {
		as: 'Hex',
		path: Mnemonic.path({ account: 9 }),
	}),
)

function createFeePayerTransport() {
	return custom({
		async request({ method, params }) {
			const response = await SELF.fetch('https://fee-payer.test/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method,
					params,
				}),
			})
			const data = (await response.json()) as {
				result?: unknown
				error?: { code: number; message: string }
			}
			if (data.error) {
				throw new Error(data.error.message || 'RPC Error')
			}
			return data.result
		},
	})
}

function createTempoTransport() {
	return custom({
		async request({ method, params }) {
			const response = await fetch(env.TEMPO_RPC_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method,
					params,
				}),
			})
			const data = (await response.json()) as {
				result?: unknown
				error?: { code: number; message: string }
			}
			if (data.error) {
				throw new Error(data.error.message || 'RPC Error')
			}
			return data.result
		},
	})
}

// Check if local Tempo is available (Docker must be running)
async function isTempoAvailable(): Promise<boolean> {
	try {
		const response = await fetch(env.TEMPO_RPC_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'web3_clientVersion',
			}),
		})
		return response.ok
	} catch {
		return false
	}
}

// Track Tempo availability for conditional test execution
let tempoAvailable = false

describe('fee-payer integration', () => {
	describe('request handling', () => {
		it('returns error for unsupported method', async () => {
			const response = await SELF.fetch('https://fee-payer.test/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_chainId',
				}),
			})

			expect(response.status).toBe(200)
			const data = (await response.json()) as {
				error?: { code: number; name: string }
			}
			expect(data.error).toBeDefined()
			expect(data.error?.name).toBe('RpcResponse.MethodNotSupportedError')
		})

		it('handles CORS preflight requests', async () => {
			const response = await SELF.fetch('https://fee-payer.test/', {
				method: 'OPTIONS',
				headers: {
					Origin: 'https://example.com',
					'Access-Control-Request-Method': 'POST',
				},
			})

			// Should return 204 or 200 for preflight
			expect([200, 204]).toContain(response.status)
		})

		it('handles health check / root path', async () => {
			const response = await SELF.fetch('https://fee-payer.test/', {
				method: 'GET',
			})

			// GET without JSON body should return some response
			expect(response.status).toBeLessThan(500)
		})
	})

	// Transaction sponsorship tests require local Tempo Docker
	// Run with: docker run -d -p 9545:9545 ghcr.io/tempoxyz/tempo:latest
	describe('transaction sponsorship (requires Docker)', () => {
		beforeAll(async () => {
			tempoAvailable = await isTempoAvailable()
		})

		it('sponsors transaction (sign-only via eth_signRawTransaction)', async (ctx) => {
			if (!tempoAvailable) ctx.skip()
			const client = createClient({
				account: userAccount,
				chain: tempoLocalnet,
				transport: withFeePayer(
					createTempoTransport(),
					createFeePayerTransport(),
					{ policy: 'sign-only' },
				),
			})

			const receipt = await sendTransactionSync(client, {
				feePayer: true,
				to: '0x0000000000000000000000000000000000000000',
				value: 0n,
			})

			expect(receipt).toBeDefined()
			expect(receipt.feePayer).toBeDefined()
		})

		it('sponsors and broadcasts transaction (sign-and-broadcast)', async (ctx) => {
			if (!tempoAvailable) ctx.skip()
			const client = createClient({
				account: userAccount,
				chain: tempoLocalnet,
				transport: withFeePayer(
					createTempoTransport(),
					createFeePayerTransport(),
					{ policy: 'sign-and-broadcast' },
				),
			})

			const receipt = await sendTransactionSync(client, {
				feePayer: true,
				to: '0x0000000000000000000000000000000000000000',
				value: 0n,
			})

			expect(receipt).toBeDefined()
			expect(receipt.feePayer).toBeDefined()
			expect(receipt.status).toBe('success')
		})
	})
})
