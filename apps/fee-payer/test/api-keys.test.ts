import { env, exports } from 'cloudflare:workers'
import { Mnemonic } from 'ox'
import { createClient, custom } from 'viem'
import { sendTransactionSync } from 'viem/actions'
import { tempo, tempoDevnet, tempoLocalnet, tempoModerato } from 'viem/chains'
import { Account, withRelay } from 'viem/tempo'
import { describe, expect, it } from 'vitest'

const ADMIN_SECRET = 'test-admin-secret'

const tempoChain = (() => {
	const tempoEnv = env.TEMPO_ENV ?? 'localnet'
	if (tempoEnv === 'moderato' || tempoEnv === 'testnet') return tempoModerato
	if (tempoEnv === 'mainnet') return tempo
	if (tempoEnv === 'devnet') return tempoDevnet
	return tempoLocalnet
})()

const userAccount = Account.fromSecp256k1(
	Mnemonic.toPrivateKey(
		'test test test test test test test test test test test junk',
		{ as: 'Hex', path: Mnemonic.path({ account: 9 }) },
	),
)

const sponsorAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

/** Routes RPC calls through the in-process fee-payer Worker at `path`. */
function feePayerTransport(path: string) {
	return custom({
		async request({ method, params }) {
			const response = await exports.default.fetch(
				new Request(`https://fee-payer.test${path}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
				}),
			)
			const data = (await response.json()) as {
				result?: unknown
				error?: { message: string }
			}
			if (data.error) throw new Error(data.error.message || 'RPC Error')
			return data.result
		},
	})
}

/** Routes RPC calls directly to the configured Tempo node. */
function tempoTransport() {
	return custom({
		async request({ method, params }) {
			const response = await fetch(env.TEMPO_RPC_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
			})
			const data = (await response.json()) as {
				result?: unknown
				error?: { message: string }
			}
			if (data.error) throw new Error(data.error.message || 'RPC Error')
			return data.result
		},
	})
}

function adminRequest(method: string, path: string, body?: unknown): Request {
	return new Request(`https://fee-payer.test/admin${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${ADMIN_SECRET}`,
		},
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	})
}

function feePayerRequest(path: string, rpcBody: unknown): Request {
	return new Request(`https://fee-payer.test${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(rpcBody),
	})
}

describe('admin API key management', () => {
	describe('authentication', () => {
		it('rejects requests without Authorization header', async () => {
			const response = await exports.default.fetch(
				new Request('https://fee-payer.test/admin/keys', {
					method: 'GET',
				}),
			)
			expect(response.status).toBe(401)
			const data = (await response.json()) as { error: string }
			expect(data.error).toBe('Unauthorized')
		})

		it('rejects requests with wrong secret', async () => {
			const response = await exports.default.fetch(
				new Request('https://fee-payer.test/admin/keys', {
					method: 'GET',
					headers: { Authorization: 'Bearer wrong-secret' },
				}),
			)
			expect(response.status).toBe(401)
		})

		it('accepts requests with correct secret', async () => {
			const response = await exports.default.fetch(adminRequest('GET', '/keys'))
			expect(response.status).toBe(200)
		})
	})

	describe('CRUD operations', () => {
		it('creates a key with minimal fields', async () => {
			const response = await exports.default.fetch(
				adminRequest('POST', '/keys', { label: 'Test Key' }),
			)
			expect(response.status).toBe(201)
			const data = (await response.json()) as { key: string }
			expect(data.key).toMatch(/^tp_/)
		})

		it('creates a key with all fields', async () => {
			const response = await exports.default.fetch(
				adminRequest('POST', '/keys', {
					label: 'Full Key',
					dailyLimitUsd: '10.00',
					allowedDestinations: ['0x0000000000000000000000000000000000000001'],
				}),
			)
			expect(response.status).toBe(201)
			const data = (await response.json()) as { key: string }
			expect(data.key).toMatch(/^tp_/)
		})

		it('rejects create with missing label', async () => {
			const response = await exports.default.fetch(
				adminRequest('POST', '/keys', {}),
			)
			expect(response.status).toBe(400)
		})

		it('lists keys', async () => {
			// Create a key first.
			const createRes = await exports.default.fetch(
				adminRequest('POST', '/keys', { label: 'List Test' }),
			)
			expect(createRes.status).toBe(201)

			const response = await exports.default.fetch(adminRequest('GET', '/keys'))
			expect(response.status).toBe(200)
			const data = (await response.json()) as {
				keys: Array<{ key: string; record: { label: string } }>
				cursor: string | null
			}
			expect(data.keys.length).toBeGreaterThan(0)
			const found = data.keys.some((k) => k.record.label === 'List Test')
			expect(found).toBe(true)
		})

		it('updates a key', async () => {
			const createRes = await exports.default.fetch(
				adminRequest('POST', '/keys', { label: 'Update Me' }),
			)
			const { key } = (await createRes.json()) as { key: string }

			const updateRes = await exports.default.fetch(
				adminRequest('PATCH', `/keys/${key}`, {
					label: 'Updated',
					dailyLimitUsd: '5.00',
				}),
			)
			expect(updateRes.status).toBe(200)

			// Verify the update via list.
			const listRes = await exports.default.fetch(adminRequest('GET', '/keys'))
			const data = (await listRes.json()) as {
				keys: Array<{
					key: string
					record: { label: string; dailyLimitUsd: string | null }
				}>
			}
			const updated = data.keys.find((k) => k.key === key)
			expect(updated?.record.label).toBe('Updated')
			expect(updated?.record.dailyLimitUsd).toBe('5.00')
		})

		it('returns 404 for updating nonexistent key', async () => {
			const response = await exports.default.fetch(
				adminRequest('PATCH', '/keys/tp_nonexistent', {
					label: 'nope',
				}),
			)
			expect(response.status).toBe(404)
		})

		it('revokes a key', async () => {
			const createRes = await exports.default.fetch(
				adminRequest('POST', '/keys', { label: 'Revoke Me' }),
			)
			const { key } = (await createRes.json()) as { key: string }

			const deleteRes = await exports.default.fetch(
				adminRequest('DELETE', `/keys/${key}`),
			)
			expect(deleteRes.status).toBe(200)

			// Verify revoked key shows as inactive in list.
			const listRes = await exports.default.fetch(adminRequest('GET', '/keys'))
			const data = (await listRes.json()) as {
				keys: Array<{
					key: string
					record: { active: boolean }
				}>
			}
			const revoked = data.keys.find((k) => k.key === key)
			expect(revoked?.record.active).toBe(false)
		})

		it('returns 404 for revoking nonexistent key', async () => {
			const response = await exports.default.fetch(
				adminRequest('DELETE', '/keys/tp_nonexistent'),
			)
			expect(response.status).toBe(404)
		})
	})
})

describe('API key sponsorship integration', () => {
	it('rejects requests with invalid API key', async () => {
		const response = await exports.default.fetch(
			feePayerRequest('/tp_invalid_key_12345678', {
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_chainId',
			}),
		)
		expect(response.status).toBe(401)
		const data = (await response.json()) as { error: string }
		expect(data.error).toBe('Invalid or revoked API key')
	})

	it('rejects requests with revoked API key', async () => {
		// Create and revoke a key.
		const createRes = await exports.default.fetch(
			adminRequest('POST', '/keys', { label: 'Revoke Test' }),
		)
		const { key } = (await createRes.json()) as { key: string }
		await exports.default.fetch(adminRequest('DELETE', `/keys/${key}`))

		const response = await exports.default.fetch(
			feePayerRequest(`/${key}`, {
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_chainId',
			}),
		)
		expect(response.status).toBe(401)
	})

	it('passes through with valid API key', async () => {
		const createRes = await exports.default.fetch(
			adminRequest('POST', '/keys', { label: 'Valid Key' }),
		)
		const { key } = (await createRes.json()) as { key: string }

		// eth_chainId should be proxied successfully (not a 401/403),
		// proving the API key middleware passed.
		const response = await exports.default.fetch(
			feePayerRequest(`/${key}`, {
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_chainId',
			}),
		)
		expect(response.status).toBe(200)
		const data = (await response.json()) as {
			result?: string
		}
		expect(data.result).toBeDefined()
	})

	it('open access still works without API key', async () => {
		const response = await exports.default.fetch(
			feePayerRequest('/', {
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_chainId',
			}),
		)
		// Should reach the handler, not be rejected.
		expect(response.status).toBe(200)
	})

	it('sponsors a transaction routed through an API key path', async () => {
		// Create a valid API key.
		const createRes = await exports.default.fetch(
			adminRequest('POST', '/keys', { label: 'Sponsorship Test' }),
		)
		const { key } = (await createRes.json()) as { key: string }

		// Build a withRelay client whose relay transport hits the
		// fee-payer Worker via the /tp_* API key path. This exercises the
		// full middleware chain (apiKey + rateLimit) on a real sponsored
		// fill + sign + broadcast.
		const client = createClient({
			account: userAccount,
			chain: tempoChain,
			transport: withRelay(tempoTransport(), feePayerTransport(`/${key}`), {
				policy: 'sign-and-broadcast',
			}),
		})

		const receipt = await sendTransactionSync(client, {
			feePayer: true,
			to: '0x0000000000000000000000000000000000000002',
			value: 0n,
		})

		expect(receipt.transactionHash).toBeDefined()
		expect(receipt.status).toBe('success')
		expect(receipt.from.toLowerCase()).toBe(userAccount.address.toLowerCase())
		expect(receipt.feePayer?.toLowerCase()).toBe(sponsorAddress.toLowerCase())
		expect(receipt.feeToken).toMatch(/^0x[a-fA-F0-9]{40}$/)
	})
})
