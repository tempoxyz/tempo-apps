import { env, SELF } from 'cloudflare:test'
import { Mnemonic } from 'ox'
import { createClient, custom } from 'viem'
import { sendTransactionSync } from 'viem/actions'
import { tempoLocalnet } from 'viem/chains'
import { Account, withFeePayer } from 'viem/tempo'
import { describe, expect, it } from 'vitest'

const testMnemonic =
	'test test test test test test test test test test test junk'

const sponsorAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

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
				error?: { code: number; message: string; data?: unknown }
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

function getExplorerUrl(txHash: string): string {
	if (env.VITE_TEMPO_ENV === 'testnet') {
		return `https://explore.tempo.xyz/tx/${txHash}`
	}
	return `http://localhost:9545/tx/${txHash}`
}

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

			expect([200, 204]).toContain(response.status)
		})

		it('handles health check / root path', async () => {
			const response = await SELF.fetch('https://fee-payer.test/', {
				method: 'GET',
			})

			expect(response.status).toBeLessThan(500)
		})
	})

	describe('transaction sponsorship', () => {
		it('sponsors transaction (sign-only via eth_signRawTransaction)', async () => {
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

			console.log(`Transaction: ${getExplorerUrl(receipt.transactionHash)}`)

			expect(receipt.transactionHash).toBeDefined()
			expect(receipt.from.toLowerCase()).toBe(userAccount.address.toLowerCase())
			expect(receipt.feePayer.toLowerCase()).toBe(sponsorAddress.toLowerCase())
		})

		it('sponsors and broadcasts transaction (sign-and-broadcast)', async () => {
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

			console.log(`Transaction: ${getExplorerUrl(receipt.transactionHash)}`)

			expect(receipt.transactionHash).toBeDefined()
			expect(receipt.blockNumber).toBeGreaterThan(0n)
			expect(receipt.from.toLowerCase()).toBe(userAccount.address.toLowerCase())
			expect(receipt.feePayer.toLowerCase()).toBe(sponsorAddress.toLowerCase())
			expect(receipt.status).toBe('success')
		})
	})
})
