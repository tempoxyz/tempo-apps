import { env, exports } from 'cloudflare:workers'
import { runInDurableObject, SELF } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { Transaction } from 'viem/tempo'
import * as Encryption from '../src/crypto.js'
import type { Key, Request as Operation, Tenant } from '../src/schema.js'

const account = privateKeyToAddress(generatePrivateKey())
const tenant: Tenant = {
	orgId: crypto.randomUUID(),
	projectId: crypto.randomUUID(),
	environment: 'sandbox',
}

async function request(input: Operation) {
	return exports.AccessKeys.fetch(
		new Request('https://access-keys.internal', {
			method: 'POST',
			body: JSON.stringify(input),
		}),
	)
}

async function create(
	owner: Tenant = { ...tenant, orgId: crypto.randomUUID() },
) {
	const response = await request({
		operation: 'create',
		tenant: owner,
		account,
		chainId: 42431,
	})
	expect(response.status).toBe(201)
	return { owner, key: (await response.json()) as Key }
}

async function transaction(chainId = 42431) {
	return Transaction.serialize({
		type: 'tempo',
		chainId,
		calls: [{ to: account, data: '0x', value: 0n }],
		gas: 21000n,
		maxFeePerGas: 100n,
		maxPriorityFeePerGas: 0n,
		nonce: 0,
	})
}

describe('private service', () => {
	test('public entrypoint exposes no key operations', async () => {
		const response = await SELF.fetch('https://example.com', {
			method: 'POST',
			body: '{}',
		})
		expect(response.status).toBe(404)
	})
	test('validates input and does not accept plaintext imports', async () => {
		const response = await exports.AccessKeys.fetch(
			new Request('https://access-keys.internal', {
				method: 'POST',
				body: JSON.stringify({
					operation: 'create',
					tenant,
					account,
					chainId: 42431,
					privateKey: generatePrivateKey(),
				}),
			}),
		)
		expect(response.status).toBe(400)
	})
})

describe('lifecycle', () => {
	test('creates and lists public metadata, never key material', async () => {
		const { owner, key } = await create()
		expect(Object.keys(key).sort()).toEqual([
			'account',
			'address',
			'chainId',
			'createdAt',
			'id',
		])
		const list = await request({ operation: 'list', tenant: owner })
		expect(await list.json()).toEqual({ data: [key], nextCursor: null })
	})
	test.each([
		'orgId',
		'projectId',
		'environment',
	] as const)('isolates %s', async (field) => {
		const { owner, key } = await create()
		const other = {
			...owner,
			[field]: field === 'environment' ? 'production' : crypto.randomUUID(),
		} as Tenant
		for (const operation of ['get', 'revoke', 'sign'] as const) {
			const response = await request({
				operation,
				tenant: other,
				id: key.id,
				...(operation === 'sign' ? { transaction: await transaction() } : {}),
			} as Operation)
			expect(response.status).toBe(404)
		}
	})
	test('signs only a Tempo access-key envelope for the stored chain and account', async () => {
		const { owner, key } = await create()
		const response = await request({
			operation: 'sign',
			tenant: owner,
			id: key.id,
			transaction: await transaction(),
		})
		expect(response.status).toBe(200)
		const result = (await response.json()) as {
			serializedTransaction: `0x76${string}`
		}
		const signed = Transaction.deserialize(result.serializedTransaction)
		expect(signed.signature?.type).toBe('keychain')
		if (signed.signature?.type === 'keychain')
			expect(signed.signature.userAddress.toLowerCase()).toBe(
				account.toLowerCase(),
			)
		const wrongChain = await request({
			operation: 'sign',
			tenant: owner,
			id: key.id,
			transaction: await transaction(4217),
		})
		expect(wrongChain.status).toBe(400)
		const resign = await request({
			operation: 'sign',
			tenant: owner,
			id: key.id,
			transaction: result.serializedTransaction,
		})
		expect(resign.status).toBe(400)
	})
	test('revocation is idempotent and permanently stops signing', async () => {
		const { owner, key } = await create()
		const first = await request({
			operation: 'revoke',
			tenant: owner,
			id: key.id,
		})
		const second = await request({
			operation: 'revoke',
			tenant: owner,
			id: key.id,
		})
		expect(await first.json()).toEqual(await second.json())
		const signed = await request({
			operation: 'sign',
			tenant: owner,
			id: key.id,
			transaction: await transaction(),
		})
		expect(signed.status).toBe(409)
	})
	test('persists only authenticated ciphertext and deletes it on revocation', async () => {
		const { owner, key } = await create()
		const digest = await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(
				JSON.stringify([owner.orgId, owner.projectId, owner.environment]),
			),
		)
		const name = Array.from(new Uint8Array(digest), (byte) =>
			byte.toString(16).padStart(2, '0'),
		).join('')
		const stub = env.KEYS.get(env.KEYS.idFromName(name))
		const stored = await runInDurableObject(stub, async (_instance, state) =>
			state.storage.get<{ key: Key; encrypted: Encryption.Ciphertext }>(
				`key:${key.id}`,
			),
		)
		expect(stored?.encrypted.version).toBe(1)
		expect(stored?.encrypted.keyId).toBe('test')
		expect(JSON.stringify(stored)).not.toMatch(/0x[0-9a-f]{64}/i)
		await request({ operation: 'revoke', tenant: owner, id: key.id })
		const revoked = await runInDurableObject(stub, async (_instance, state) =>
			state.storage.get(`key:${key.id}`),
		)
		expect(revoked).not.toHaveProperty('encrypted')
	})
})

describe('encryption', () => {
	test('authenticates tenant and immutable metadata and fails without the key', async () => {
		const { owner, key } = await create()
		const privateKey = generatePrivateKey()
		const encrypted = await Encryption.encrypt({
			env,
			key,
			tenant: owner,
			privateKey,
		})
		expect(
			await Encryption.decrypt({ env, key, tenant: owner, encrypted }),
		).toBe(privateKey)
		await expect(
			Encryption.decrypt({
				env,
				key: { ...key, chainId: 4217 },
				tenant: owner,
				encrypted,
			}),
		).rejects.toThrow()
		await expect(
			Encryption.decrypt({
				env,
				key,
				tenant: { ...owner, orgId: 'other' },
				encrypted,
			}),
		).rejects.toThrow()
		await expect(
			Encryption.decrypt({
				env: { ...env, ACCESS_KEYS_ENCRYPTION_KEYS: '{}' },
				key,
				tenant: owner,
				encrypted,
			}),
		).rejects.toThrow()
	})
})
