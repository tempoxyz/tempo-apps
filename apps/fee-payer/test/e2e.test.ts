import { env, exports } from 'cloudflare:workers'
import { Mnemonic } from 'ox'
import { createClient, custom, http, parseUnits } from 'viem'
import { sendTransactionSync } from 'viem/actions'
import { Account, Actions, withRelay } from 'viem/tempo'
import { beforeAll, describe, expect, it } from 'vitest'
import { pathUsd } from '../src/lib/consts.js'
import {
	sponsorAddress,
	createTestAccount,
	tempoChain,
	tempoTransport,
	testMnemonic,
} from './helpers.js'

function createFeePayerTransportWithSpy() {
	const requests: Array<{ method: string; params: unknown }> = []

	const transport = custom({
		async request({ method, params }) {
			requests.push({ method, params })

			const response = await exports.default.fetch(
				new Request('https://fee-payer.test/', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						method,
						params,
					}),
				}),
			)
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

	return { transport, requests }
}

// Mint liquidity for fee tokens.
beforeAll(async () => {
	const sponsorAccount = Account.fromSecp256k1(
		Mnemonic.toPrivateKey(testMnemonic, {
			as: 'Hex',
			path: Mnemonic.path({ account: 0 }),
		}),
	)

	const client = createClient({
		account: sponsorAccount,
		chain: tempoChain,
		transport: http(env.TEMPO_RPC_URL),
	})

	await Promise.all(
		[1n, 2n, 3n].map((id) =>
			Actions.amm.mintSync(client, {
				account: sponsorAccount,
				feeToken: pathUsd,
				nonceKey: 'expiring',
				userTokenAddress: id,
				validatorTokenAddress: pathUsd,
				validatorTokenAmount: parseUnits('1000', 6),
				to: sponsorAccount.address,
			}),
		),
	)
})

describe('fee-payer integration', () => {
	describe('request handling', () => {
		it('proxies eth_chainId', async () => {
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

			expect(response.status).toBe(200)
			const data = (await response.json()) as {
				result?: string
			}
			expect(data.result).toBeDefined()
		})

		it('rejects eth_signTransaction', async () => {
			const response = await exports.default.fetch(
				new Request('https://fee-payer.test/', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						method: 'eth_signTransaction',
						params: [{ to: '0x0000000000000000000000000000000000000000' }],
					}),
				}),
			)

			expect(response.status).toBe(200)
			const data = (await response.json()) as {
				error?: { code: number; name: string }
			}
			expect(data.error).toBeDefined()
		})

		it('handles CORS preflight requests', async () => {
			const response = await exports.default.fetch(
				new Request('https://fee-payer.test/', {
					method: 'OPTIONS',
					headers: {
						Origin: 'https://example.com',
						'Access-Control-Request-Method': 'POST',
						'Access-Control-Request-Headers':
							'Content-Type, X-Tempo-Attribution-Key',
					},
				}),
			)

			expect([200, 204]).toContain(response.status)
			expect(response.headers.get('Access-Control-Allow-Headers')).toContain(
				'x-tempo-attribution-key',
			)
		})

		it('handles health check / root path', async () => {
			const response = await exports.default.fetch(
				new Request('https://fee-payer.test/', {
					method: 'GET',
				}),
			)

			expect(response.status).toBeLessThan(500)
		})
	})

	describe('transaction sponsorship', () => {
		it('sponsors transaction (sign-only via eth_signRawTransaction)', async () => {
			const { transport: feePayerTransport, requests: feePayerRequests } =
				createFeePayerTransportWithSpy()
			const account = createTestAccount()

			const client = createClient({
				account,
				chain: tempoChain,
				transport: withRelay(tempoTransport(), feePayerTransport, {
					policy: 'sign-only',
				}),
			})

			const receipt = await sendTransactionSync(client, {
				feePayer: true,
				to: '0x0000000000000000000000000000000000000000',
				value: 0n,
			})

			console.log(`Transaction hash: ${receipt.transactionHash}`)

			expect(receipt.transactionHash).toBeDefined()
			expect(receipt.from.toLowerCase()).toBe(account.address.toLowerCase())
			expect(receipt.feePayer?.toLowerCase()).toBe(sponsorAddress.toLowerCase())
			// Regression: sponsored transactions must pay with PathUSD,
			// avoiding account-level fee token preferences that can route
			// through illiquid FeeAMM pools.
			expect(receipt.feeToken?.toLowerCase()).toBe(pathUsd.toLowerCase())

			// Assert RPC methods sent to fee-payer service
			const sponsorshipRequests = feePayerRequests.filter((request) =>
				['eth_fillTransaction', 'eth_signRawTransaction'].includes(
					request.method,
				),
			)
			expect(sponsorshipRequests).toHaveLength(1)
			expect(sponsorshipRequests[0].method).toBe('eth_fillTransaction')
			expect(sponsorshipRequests[0].params).toBeDefined()
		})

		it('sponsors and broadcasts transaction (sign-and-broadcast)', async () => {
			const { transport: feePayerTransport, requests: feePayerRequests } =
				createFeePayerTransportWithSpy()
			const account = createTestAccount()

			const client = createClient({
				account,
				chain: tempoChain,
				transport: withRelay(tempoTransport(), feePayerTransport, {
					policy: 'sign-and-broadcast',
				}),
			})

			const receipt = await sendTransactionSync(client, {
				feePayer: true,
				to: '0x0000000000000000000000000000000000000001',
				value: 0n,
			})

			console.log(`Transaction hash: ${receipt.transactionHash}`)

			expect(receipt.transactionHash).toBeDefined()
			expect(receipt.blockNumber).toBeGreaterThan(0n)
			expect(receipt.from.toLowerCase()).toBe(account.address.toLowerCase())
			expect(receipt.feePayer?.toLowerCase()).toBe(sponsorAddress.toLowerCase())
			expect(receipt.status).toBe('success')
			// Regression: sponsored transactions must pay with PathUSD,
			// avoiding account-level fee token preferences that can route
			// through illiquid FeeAMM pools.
			expect(receipt.feeToken?.toLowerCase()).toBe(pathUsd.toLowerCase())

			// Assert RPC methods sent to fee-payer service
			const sponsorshipRequests = feePayerRequests.filter((request) =>
				['eth_fillTransaction', 'eth_sendRawTransactionSync'].includes(
					request.method,
				),
			)
			expect(sponsorshipRequests).toHaveLength(1)
			expect(sponsorshipRequests[0].method).toBe('eth_fillTransaction')
			expect(sponsorshipRequests[0].params).toBeDefined()
		})
	})
})
