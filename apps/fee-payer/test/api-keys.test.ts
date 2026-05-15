import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

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

		// eth_chainId will get a MethodNotSupported from the fee payer handler
		// (not a 401/403), proving the key middleware passed.
		const response = await exports.default.fetch(
			feePayerRequest(`/${key}`, {
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_chainId',
			}),
		)
		expect(response.status).toBe(200)
		const data = (await response.json()) as {
			error?: { name: string }
		}
		expect(data.error?.name).toBe('RpcResponse.MethodNotSupportedError')
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
})
