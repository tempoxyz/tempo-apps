import type { Key, Tenant } from './schema.js'

export type Ciphertext = {
	keyId: string
	iv: string
	ciphertext: string
	version: 1
}

export async function encrypt(options: {
	env: CloudflareBindings
	key: Key
	tenant: Tenant
	privateKey: string
}): Promise<Ciphertext> {
	const keyId = options.env.ACCESS_KEYS_ACTIVE_KEY_ID
	const key = await encryptionKey(options.env, keyId)
	const iv = crypto.getRandomValues(new Uint8Array(12))
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, additionalData: context(options), tagLength: 128 },
		key,
		new TextEncoder().encode(options.privateKey),
	)
	return {
		version: 1,
		keyId,
		iv: encode(iv),
		ciphertext: encode(new Uint8Array(ciphertext)),
	}
}

export async function decrypt(options: {
	env: CloudflareBindings
	key: Key
	tenant: Tenant
	encrypted: Ciphertext
}): Promise<`0x${string}`> {
	if (options.encrypted.version !== 1)
		throw new Error('Unsupported encryption version')
	const key = await encryptionKey(options.env, options.encrypted.keyId)
	const plaintext = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: decode(options.encrypted.iv),
			additionalData: context(options),
			tagLength: 128,
		},
		key,
		decode(options.encrypted.ciphertext),
	)
	const value = new TextDecoder().decode(plaintext)
	if (!/^0x[0-9a-f]{64}$/i.test(value)) throw new Error('Invalid encrypted key')
	return value as `0x${string}`
}

function context(options: { key: Key; tenant: Tenant }) {
	const { key, tenant } = options
	return new TextEncoder().encode(
		JSON.stringify([
			'managed-access-key:v1',
			tenant.orgId,
			tenant.projectId,
			tenant.environment,
			key.id,
			key.account,
			key.address,
			key.chainId,
			key.createdAt,
		]),
	)
}

async function encryptionKey(env: CloudflareBindings, keyId: string) {
	const keys = JSON.parse(env.ACCESS_KEYS_ENCRYPTION_KEYS || '{}') as Record<
		string,
		unknown
	>
	const value = keys[keyId]
	if (!keyId || typeof value !== 'string')
		throw new Error('Encryption key unavailable')
	const bytes = decode(value)
	if (bytes.byteLength !== 32)
		throw new Error('Encryption key must contain 32 bytes')
	return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
		'encrypt',
		'decrypt',
	])
}

function encode(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes))
}

function decode(value: string) {
	return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}
