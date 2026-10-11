import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { Account, Transaction } from 'viem/tempo'
import * as Encryption from './crypto.js'
import { type Key, type Tenant, requestSchema } from './schema.js'

type StoredKey = { key: Key; encrypted?: Encryption.Ciphertext }

export default {
	fetch() {
		return new Response(null, { status: 404 })
	},
}

export class AccessKeys extends WorkerEntrypoint<CloudflareBindings> {
	async fetch(request: Request) {
		const input = requestSchema.safeParse(
			await request.json().catch(() => null),
		)
		if (!input.success) return failure('invalid_request', 400)
		const tenant = input.data.tenant
		const digest = await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(
				JSON.stringify([tenant.orgId, tenant.projectId, tenant.environment]),
			),
		)
		const name = Array.from(new Uint8Array(digest), (byte) =>
			byte.toString(16).padStart(2, '0'),
		).join('')
		return this.env.KEYS.get(this.env.KEYS.idFromName(name)).fetch(
			request.url,
			{
				method: 'POST',
				body: JSON.stringify(input.data),
			},
		)
	}
}

export class KeyStore extends DurableObject<CloudflareBindings> {
	async fetch(request: Request): Promise<Response> {
		const input = requestSchema.safeParse(
			await request.json().catch(() => null),
		)
		if (!input.success) return failure('invalid_request', 400)
		return this.ctx.blockConcurrencyWhile(async () => {
			try {
				const { tenant, operation } = input.data
				const owner = await this.ctx.storage.get<Tenant>('owner')
				if (owner && JSON.stringify(owner) !== JSON.stringify(tenant))
					return failure('not_found', 404)
				if (!owner) await this.ctx.storage.put('owner', tenant)
				if (operation === 'create') {
					const privateKey = generatePrivateKey()
					const key: Key = {
						id: `ak_${crypto.randomUUID()}`,
						account: input.data.account,
						address: privateKeyToAddress(privateKey),
						chainId: input.data.chainId,
						createdAt: new Date().toISOString(),
					}
					const encrypted = await Encryption.encrypt({
						env: this.env,
						key,
						tenant,
						privateKey,
					})
					await this.ctx.storage.put(`key:${key.id}`, {
						key,
						encrypted,
					} satisfies StoredKey)
					return Response.json(key, { status: 201 })
				}
				if (operation === 'list') {
					const records = await this.ctx.storage.list<StoredKey>({
						prefix: 'key:',
						limit: 101,
						...(input.data.cursor
							? { startAfter: `key:${input.data.cursor}` }
							: {}),
					})
					const keys = Array.from(records.values(), (record) => record.key)
					const data = keys.slice(0, 100)
					return Response.json({
						data,
						nextCursor: keys.length > 100 ? data.at(-1)?.id : null,
					})
				}
				const record = await this.ctx.storage.get<StoredKey>(
					`key:${input.data.id}`,
				)
				if (!record) return failure('not_found', 404)
				if (operation === 'get') return Response.json(record.key)
				if (operation === 'revoke') {
					record.key.revokedAt ??= new Date().toISOString()
					await this.ctx.storage.put(`key:${record.key.id}`, {
						key: record.key,
					} satisfies StoredKey)
					return Response.json(record.key)
				}
				if (!record.encrypted || record.key.revokedAt)
					return failure('key_revoked', 409)
				const transaction = (() => {
					try {
						return Transaction.deserialize(
							input.data.transaction as `0x76${string}`,
						)
					} catch {
						return undefined
					}
				})()
				if (
					!transaction ||
					transaction.chainId !== record.key.chainId ||
					transaction.signature ||
					transaction.keyAuthorization ||
					transaction.multisig ||
					transaction.feePayerSignature ||
					!Number.isSafeInteger(transaction.nonce)
				)
					return failure('invalid_transaction', 400)
				const privateKey = await Encryption.decrypt({
					env: this.env,
					key: record.key,
					tenant,
					encrypted: record.encrypted,
				})
				if (
					privateKeyToAddress(privateKey).toLowerCase() !==
					record.key.address.toLowerCase()
				)
					throw new Error('Key integrity failure')
				const account = Account.fromSecp256k1(privateKey, {
					access: record.key.account,
				})
				const serializedTransaction = await account.signTransaction(transaction)
				return Response.json({ serializedTransaction })
			} catch {
				console.error({
					event: 'managed_access_keys_failure',
					operation: input.data.operation,
				})
				return failure('service_unavailable', 503)
			}
		})
	}
}

function failure(code: string, status: number) {
	return Response.json({ error: { code } }, { status })
}
