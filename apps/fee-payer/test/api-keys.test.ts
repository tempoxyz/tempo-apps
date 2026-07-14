import { env, exports } from 'cloudflare:workers'
import { sendTransactionSync } from 'viem/actions'
import { describe, expect, it } from 'vitest'
import { pathUsd } from '../src/lib/consts.js'
import {
	buildSponsorClient,
	createTestAccount,
	sponsorAddress,
	tempoChain,
} from './helpers.js'

const ADMIN_SECRET = 'test-admin-secret'

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

async function sponsoredTransactionRequest(key: string, to: `0x${string}`) {
	const account = createTestAccount()
	const serialized = await account.signTransaction({
		chainId: tempoChain.id,
		feePayer: true,
		gas: 50_000n,
		maxFeePerGas: 20_000_000_000n,
		nonce: 0,
		to,
		value: 0n,
	})

	return feePayerRequest(`/${key}`, {
		jsonrpc: '2.0',
		id: 1,
		method: 'eth_sendRawTransactionSync',
		params: [serialized],
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
					billable: true,
				}),
			)
			expect(response.status).toBe(201)
			const data = (await response.json()) as { key: string }
			expect(data.key).toMatch(/^tp_/)

			const listRes = await exports.default.fetch(adminRequest('GET', '/keys'))
			const list = (await listRes.json()) as {
				keys: Array<{ key: string; record: { billable: boolean } }>
			}
			const entry = list.keys.find((k) => k.key === data.key)
			expect(entry?.record.billable).toBe(true)
		})

		it('rejects create with missing label', async () => {
			const response = await exports.default.fetch(
				adminRequest('POST', '/keys', {}),
			)
			expect(response.status).toBe(400)
		})

		it('defaults new and legacy keys to non-billable', async () => {
			const createRes = await exports.default.fetch(
				adminRequest('POST', '/keys', { label: 'Non-Billable Default' }),
			)
			const { key } = (await createRes.json()) as { key: string }

			const legacyKey = 'tp_legacy_non_billable_default'
			await env.SponsorApiKeyStore.put(
				`api-key:${legacyKey}`,
				JSON.stringify({
					label: 'Legacy Non-Billable Default',
					dailyLimitUsd: null,
					allowedDestinations: [],
					createdAt: '2026-06-20T12:00:00.000Z',
					active: true,
				}),
			)

			const response = await exports.default.fetch(adminRequest('GET', '/keys'))
			expect(response.status).toBe(200)
			const data = (await response.json()) as {
				keys: Array<{ key: string; record: { billable: boolean } }>
			}
			expect(
				data.keys.find((entry) => entry.key === key)?.record.billable,
			).toBe(false)
			expect(
				data.keys.find((entry) => entry.key === legacyKey)?.record.billable,
			).toBe(false)
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

		it('returns daily + lifetime spend in USD on list', async () => {
			const createRes = await exports.default.fetch(
				adminRequest('POST', '/keys', { label: 'Spend Display' }),
			)
			const { key } = (await createRes.json()) as { key: string }

			// Seed both counters: $1.50 daily (1.5M microdollars), $4.25 lifetime
			// (4.25M microdollars).
			const today = new Date().toISOString().slice(0, 10)
			await env.SponsorApiKeyStore.put(`spend:${key}:${today}`, '1500000')
			await env.SponsorApiKeyStore.put(`spend:${key}:lifetime`, '4250000')

			const response = await exports.default.fetch(adminRequest('GET', '/keys'))
			expect(response.status).toBe(200)
			const data = (await response.json()) as {
				keys: Array<{
					key: string
					dailySpentUsd: string
					lifetimeSpentUsd: string
				}>
			}
			const entry = data.keys.find((k) => k.key === key)
			expect(entry?.dailySpentUsd).toBe('1.5')
			expect(entry?.lifetimeSpentUsd).toBe('4.25')
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
					billable: true,
				}),
			)
			expect(updateRes.status).toBe(200)

			// Verify the update via list.
			const listRes = await exports.default.fetch(adminRequest('GET', '/keys'))
			const data = (await listRes.json()) as {
				keys: Array<{
					key: string
					record: {
						label: string
						dailyLimitUsd: string | null
						billable: boolean
					}
				}>
			}
			const updated = data.keys.find((k) => k.key === key)
			expect(updated?.record.label).toBe('Updated')
			expect(updated?.record.dailyLimitUsd).toBe('5.00')
			expect(updated?.record.billable).toBe(true)
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

	it('allows a sponsored transaction when destination is in allowedDestinations', async () => {
		const to = '0x0000000000000000000000000000000000000002' as const
		const createRes = await exports.default.fetch(
			adminRequest('POST', '/keys', {
				label: 'Allowlist Match',
				allowedDestinations: [to],
			}),
		)
		const { key } = (await createRes.json()) as { key: string }

		const response = await exports.default.fetch(
			await sponsoredTransactionRequest(key, to),
		)

		expect(response.status).toBe(200)
	})

	it('rejects a sponsored transaction when destination is not in allowedDestinations', async () => {
		const createRes = await exports.default.fetch(
			adminRequest('POST', '/keys', {
				label: 'Allowlist Mismatch',
				allowedDestinations: ['0x0000000000000000000000000000000000000abc'],
			}),
		)
		const { key } = (await createRes.json()) as { key: string }

		const response = await exports.default.fetch(
			await sponsoredTransactionRequest(
				key,
				'0x0000000000000000000000000000000000000002',
			),
		)

		expect(response.status).toBe(403)
		await expect(response.json()).resolves.toMatchObject({
			error: expect.stringMatching(/Destination address not allowed/),
		})
	})

	it('rejects a sponsored transaction when dailyLimitUsd is exceeded', async () => {
		const createRes = await exports.default.fetch(
			adminRequest('POST', '/keys', {
				label: 'Budget Exceeded',
				dailyLimitUsd: '0.000001',
			}),
		)
		const { key } = (await createRes.json()) as { key: string }

		// Pre-seed today's spend above the limit.
		const today = new Date().toISOString().slice(0, 10)
		await env.SponsorApiKeyStore.put(`spend:${key}:${today}`, '1000000')

		const response = await exports.default.fetch(
			await sponsoredTransactionRequest(
				key,
				'0x0000000000000000000000000000000000000002',
			),
		)

		expect(response.status).toBe(429)
		await expect(response.json()).resolves.toMatchObject({
			error: expect.stringMatching(/Daily spend limit exceeded/),
		})
	})

	it('records spend after a sponsored transaction under dailyLimitUsd', async () => {
		const createRes = await exports.default.fetch(
			adminRequest('POST', '/keys', {
				label: 'Budget Under',
				dailyLimitUsd: '100.00',
			}),
		)
		const { key } = (await createRes.json()) as { key: string }

		await exports.default.fetch(
			await sponsoredTransactionRequest(
				key,
				'0x0000000000000000000000000000000000000002',
			),
		)

		// recordSpend runs via ctx.waitUntil; poll briefly until it lands.
		const today = new Date().toISOString().slice(0, 10)
		let spend: string | null = null
		for (let i = 0; i < 20; i++) {
			spend = await env.SponsorApiKeyStore.get(`spend:${key}:${today}`)
			if (spend) break
			await new Promise((r) => setTimeout(r, 100))
		}
		expect(spend).not.toBeNull()
		expect(BigInt(spend ?? '0')).toBeGreaterThan(0n)

		// Lifetime spend is written alongside the daily counter and matches it
		// when only one sponsored transaction has been recorded for this key.
		const lifetime = await env.SponsorApiKeyStore.get(`spend:${key}:lifetime`)
		expect(lifetime).not.toBeNull()
		expect(BigInt(lifetime ?? '0')).toBe(BigInt(spend ?? '0'))
	})

	it('accumulates lifetime spend across multiple sponsored transactions', async () => {
		const createRes = await exports.default.fetch(
			adminRequest('POST', '/keys', {
				label: 'Lifetime Accumulation',
				dailyLimitUsd: '100.00',
			}),
		)
		const { key } = (await createRes.json()) as { key: string }

		async function waitForLifetime(prev: bigint): Promise<bigint> {
			for (let i = 0; i < 30; i++) {
				const raw = await env.SponsorApiKeyStore.get(`spend:${key}:lifetime`)
				if (raw && BigInt(raw) > prev) return BigInt(raw)
				await new Promise((r) => setTimeout(r, 100))
			}
			throw new Error('lifetime spend never advanced')
		}

		// First sponsored tx — lifetime starts from 0.
		await exports.default.fetch(
			await sponsoredTransactionRequest(
				key,
				'0x0000000000000000000000000000000000000002',
			),
		)
		const afterFirst = await waitForLifetime(0n)

		// Second sponsored tx — lifetime should strictly increase, not be
		// overwritten with the second-tx-only fee.
		await exports.default.fetch(
			await sponsoredTransactionRequest(
				key,
				'0x0000000000000000000000000000000000000002',
			),
		)
		const afterSecond = await waitForLifetime(afterFirst)

		expect(afterSecond).toBeGreaterThan(afterFirst)
		// Lifetime should approximate the sum of the two individual fees; for
		// identical no-op txs the second fee is ~equal to the first, so the
		// total should be at least ~1.5× the first (allow slack for KV race).
		expect(afterSecond).toBeGreaterThanOrEqual((afterFirst * 3n) / 2n)
	})

	it('sponsors a transaction routed through an API key path', async () => {
		// Create a valid API key.
		const createRes = await exports.default.fetch(
			adminRequest('POST', '/keys', { label: 'Sponsorship Test' }),
		)
		const { key } = (await createRes.json()) as { key: string }
		const account = createTestAccount()

		// Build a withRelay client whose relay transport hits the
		// fee-payer Worker via the /tp_* API key path. This exercises the
		// full middleware chain (apiKey + rateLimit) on a real sponsored
		// fill + sign + broadcast.
		const receipt = await sendTransactionSync(
			buildSponsorClient(key, account),
			{
				feePayer: true,
				to: '0x0000000000000000000000000000000000000002',
				value: 0n,
			},
		)

		expect(receipt.transactionHash).toBeDefined()
		expect(receipt.status).toBe('success')
		expect(receipt.from.toLowerCase()).toBe(account.address.toLowerCase())
		expect(receipt.feePayer?.toLowerCase()).toBe(sponsorAddress.toLowerCase())
		expect(receipt.feeToken?.toLowerCase()).toBe(pathUsd.toLowerCase())
	})
})
