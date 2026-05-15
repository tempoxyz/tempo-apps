import { env } from 'cloudflare:workers'
import * as z from 'zod'

/** Schema for an API key record stored in KV. */
const ApiKeyRecord = z.object({
	/** Human-readable label (e.g. "Acme Corp - testnet"). */
	label: z.string(),
	/** Daily spend limit in USD (e.g. "1.00"). Null = unlimited. */
	dailyLimitUsd: z.string().nullable(),
	/** Allowed destination addresses. Empty = any destination. */
	allowedDestinations: z.array(z.string()),
	/** ISO timestamp of creation. */
	createdAt: z.string(),
	/** Whether the key is active. */
	active: z.boolean(),
})

export type ApiKeyRecord = z.infer<typeof ApiKeyRecord>

const KV_PREFIX = 'api-key:'

function kvKey(key: string) {
	return `${KV_PREFIX}${key}`
}

/** Generate a random API key with a `tp_` prefix. */
export function generateKey(): string {
	const bytes = new Uint8Array(24)
	crypto.getRandomValues(bytes)
	const raw = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
	return `tp_${raw}`
}

/** Look up an API key record from KV. Returns `null` on miss or inactive key. */
export async function getApiKey(key: string): Promise<ApiKeyRecord | null> {
	const raw = await env.ApiKeyStore.get(kvKey(key))
	if (!raw) return null
	const parsed = ApiKeyRecord.safeParse(JSON.parse(raw))
	if (!parsed.success) return null
	if (!parsed.data.active) return null
	return parsed.data
}

/** Create a new API key and store in KV. Returns the generated key string. */
export async function createApiKey(
	record: Omit<ApiKeyRecord, 'createdAt' | 'active'>,
): Promise<string> {
	const key = generateKey()
	const full: ApiKeyRecord = {
		...record,
		createdAt: new Date().toISOString(),
		active: true,
	}
	await env.ApiKeyStore.put(kvKey(key), JSON.stringify(full))
	return key
}

/** Update an existing API key record. */
export async function updateApiKey(
	key: string,
	updates: Partial<
		Pick<
			ApiKeyRecord,
			'label' | 'dailyLimitUsd' | 'allowedDestinations' | 'active'
		>
	>,
): Promise<boolean> {
	const existing = await env.ApiKeyStore.get(kvKey(key))
	if (!existing) return false
	const parsed = ApiKeyRecord.safeParse(JSON.parse(existing))
	if (!parsed.success) return false
	const updated = { ...parsed.data, ...updates }
	await env.ApiKeyStore.put(kvKey(key), JSON.stringify(updated))
	return true
}

/** Revoke (soft-delete) an API key. */
export async function revokeApiKey(key: string): Promise<boolean> {
	return updateApiKey(key, { active: false })
}

/** List all API keys (paginated via KV list). Returns key + record pairs. */
export async function listApiKeys(cursor?: string): Promise<{
	keys: Array<{ key: string; record: ApiKeyRecord }>
	cursor: string | null
}> {
	const list = await env.ApiKeyStore.list({
		prefix: KV_PREFIX,
		cursor: cursor ?? undefined,
	})
	const keys: Array<{ key: string; record: ApiKeyRecord }> = []
	for (const item of list.keys) {
		const raw = await env.ApiKeyStore.get(item.name)
		if (!raw) continue
		const parsed = ApiKeyRecord.safeParse(JSON.parse(raw))
		if (!parsed.success) continue
		keys.push({
			key: item.name.slice(KV_PREFIX.length),
			record: parsed.data,
		})
	}
	return {
		keys,
		cursor: list.list_complete ? null : (list.cursor as string),
	}
}
