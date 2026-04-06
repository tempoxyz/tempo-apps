import { env, exports } from 'cloudflare:workers'
import { Mnemonic } from 'ox'
import { createClient, custom, http, parseUnits } from 'viem'
import { sendTransactionSync } from 'viem/actions'
import { tempo, tempoDevnet, tempoLocalnet, tempoModerato } from 'viem/chains'
import { Account, Actions, withFeePayer } from 'viem/tempo'
import { beforeAll, describe, expect, it } from 'vitest'

const tempoChain = (() => {
	const tempoEnv = env.TEMPO_ENV ?? 'localnet'
	if (tempoEnv === 'moderato' || tempoEnv === 'testnet') return tempoModerato
	if (tempoEnv === 'mainnet') return tempo
	if (tempoEnv === 'devnet') return tempoDevnet
	return tempoLocalnet
})()

const testMnemonic =
	'test test test test test test test test test test test junk'

const sponsorAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const userAccount = Account.fromSecp256k1(
	Mnemonic.toPrivateKey(testMnemonic, {
		as: 'Hex',
		path: Mnemonic.path({ account: 9 }),
	}),
)

const sponsorshipRetryDelayMs = 500
const sponsorshipTestTimeoutMs = 30_000

async function parseRpcResult(
	response: Response,
	target: string,
	method: string,
): Promise<unknown> {
	const bodyText = await response.text()
	const body = bodyText ? JSON.parse(bodyText) : {}

	if (!response.ok) {
		throw new Error(
			`${target} ${method} returned HTTP ${response.status}: ${bodyText || '<empty body>'}`,
		)
	}

	if (
		typeof body === 'object' &&
		body !== null &&
		'error' in body &&
		body.error
	) {
		const message =
			typeof body.error === 'object' &&
			body.error !== null &&
			'message' in body.error &&
			typeof body.error.message === 'string'
				? body.error.message
				: JSON.stringify(body.error)
		throw new Error(`${target} ${method} failed: ${message}`)
	}

	if (typeof body === 'object' && body !== null && 'result' in body) {
		return body.result
	}

	throw new Error(
		`${target} ${method} returned unexpected JSON: ${bodyText || '<empty body>'}`,
	)
}

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
			return parseRpcResult(response, 'fee-payer', method)
		},
	})

	return { transport, requests }
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
			return parseRpcResult(response, 'tempo-rpc', method)
		},
	})
}

async function retrySponsorship<T>(
	action: () => Promise<T>,
	description: string,
	maxRetries = 8,
	delayMs = sponsorshipRetryDelayMs,
): Promise<T> {
	let lastError: unknown

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await action()
		} catch (error) {
			lastError = error
			if (attempt < maxRetries) {
				await new Promise((resolve) => setTimeout(resolve, delayMs))
			}
		}
	}

	throw new Error(
		`${description} did not succeed after ${maxRetries} attempts: ${String(lastError)}`,
	)
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

	// Use sequential mints to avoid same-account transaction races in CI.
	for (const id of [1n, 2n, 3n]) {
		await Actions.amm.mintSync(client, {
			account: sponsorAccount,
			feeToken: '0x20c0000000000000000000000000000000000000',
			nonceKey: 'expiring',
			userTokenAddress: id,
			validatorTokenAddress: '0x20c0000000000000000000000000000000000000',
			validatorTokenAmount: parseUnits('1000', 6),
			to: sponsorAccount.address,
		})
	}
})

describe('fee-payer integration', () => {
	describe('request handling', () => {
		it('returns error for unsupported method', async () => {
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
				error?: { code: number; name: string }
			}
			expect(data.error).toBeDefined()
			expect(data.error?.name).toBe('RpcResponse.MethodNotSupportedError')
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
					},
				}),
			)

			expect([200, 204]).toContain(response.status)
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
		it(
			'sponsors transaction (sign-only via eth_signRawTransaction)',
			async () => {
				const { transport: feePayerTransport, requests: feePayerRequests } =
					createFeePayerTransportWithSpy()

				const client = createClient({
					account: userAccount,
					chain: tempoChain,
					transport: withFeePayer(createTempoTransport(), feePayerTransport, {
						policy: 'sign-only',
					}),
				})

				const receipt = await retrySponsorship(
					() =>
						sendTransactionSync(client, {
							feePayer: true,
							to: '0x0000000000000000000000000000000000000000',
							value: 0n,
						}),
					'sign-only sponsored transaction',
				)

				console.log(`Transaction hash: ${receipt.transactionHash}`)

				expect(receipt.transactionHash).toBeDefined()
				expect(receipt.from.toLowerCase()).toBe(
					userAccount.address.toLowerCase(),
				)
				expect(receipt.feePayer?.toLowerCase()).toBe(
					sponsorAddress.toLowerCase(),
				)

				// Assert RPC methods sent to fee-payer service
				expect(feePayerRequests.length).toBeGreaterThan(0)
				expect(feePayerRequests.at(-1)?.method).toBe('eth_signRawTransaction')
				expect(feePayerRequests.at(-1)?.params).toBeDefined()
			},
			sponsorshipTestTimeoutMs,
		)

		it(
			'sponsors and broadcasts transaction (sign-and-broadcast)',
			async () => {
				const { transport: feePayerTransport, requests: feePayerRequests } =
					createFeePayerTransportWithSpy()

				const client = createClient({
					account: userAccount,
					chain: tempoChain,
					transport: withFeePayer(createTempoTransport(), feePayerTransport, {
						policy: 'sign-and-broadcast',
					}),
				})

				const receipt = await retrySponsorship(
					() =>
						sendTransactionSync(client, {
							feePayer: true,
							to: '0x0000000000000000000000000000000000000001',
							value: 0n,
						}),
					'sign-and-broadcast sponsored transaction',
				)

				console.log(`Transaction hash: ${receipt.transactionHash}`)

				expect(receipt.transactionHash).toBeDefined()
				expect(receipt.blockNumber).toBeGreaterThan(0n)
				expect(receipt.from.toLowerCase()).toBe(
					userAccount.address.toLowerCase(),
				)
				expect(receipt.feePayer?.toLowerCase()).toBe(
					sponsorAddress.toLowerCase(),
				)
				expect(receipt.status).toBe('success')

				// Assert RPC methods sent to fee-payer service
				expect(feePayerRequests.length).toBeGreaterThan(0)
				expect(feePayerRequests.at(-1)?.method).toBe(
					'eth_sendRawTransactionSync',
				)
				expect(feePayerRequests.at(-1)?.params).toBeDefined()
			},
			sponsorshipTestTimeoutMs,
		)
	})
})
