import { env, SELF } from 'cloudflare:test'
import { Mnemonic } from 'ox'
import { createClient, custom } from 'viem'
import { sendTransactionSync } from 'viem/actions'
import { tempoTestnet } from 'viem/chains'
import { Account, withFeePayer } from 'viem/tempo'
import { describe, expect, it } from 'vitest'

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

describe('fee-payer', () => {
	describe('GET /usage', () => {
		it('returns usage data', async () => {
			const response = await SELF.fetch('https://fee-payer.test/usage')
			expect(response.status).toBe(200)

			const data = (await response.json()) as {
				feePayerAddress: string
				feesPaid: string
				feeCurrency: string
				numTransactions: number
				endingAt: number | null
				startingAt: number | null
			}

			expect(data).toHaveProperty('feePayerAddress')
			expect(data).toHaveProperty('feesPaid')
			expect(data).toHaveProperty('feeCurrency')
			expect(data).toHaveProperty('numTransactions')
			expect(typeof data.feePayerAddress).toBe('string')
			expect(data.feePayerAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
		})

		it('accepts query parameters for time range', async () => {
			const now = Math.floor(Date.now() / 1000)
			const oneWeekAgo = now - 7 * 24 * 60 * 60

			const response = await SELF.fetch(
				`https://fee-payer.test/usage?blockTimestampFrom=${oneWeekAgo}&blockTimestampTo=${now}`,
			)
			expect(response.status).toBe(200)

			const data = (await response.json()) as {
				feePayerAddress: string
				numTransactions: number
			}
			expect(data).toHaveProperty('feePayerAddress')
			expect(typeof data.numTransactions).toBe('number')
		})
	})

	describe('fee payer sponsorship', () => {
		it('sponsors transaction (sign-only via eth_signRawTransaction)', async () => {
			const client = createClient({
				account: userAccount,
				chain: tempoTestnet,
				transport: withFeePayer(
					custom({
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
					}),
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

		it('sponsors and broadcasts transaction (sign-and-broadcast)', async () => {
			const client = createClient({
				account: userAccount,
				chain: tempoTestnet,
				transport: withFeePayer(
					custom({
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
					}),
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
	})
})
