import type { Context, Next } from 'hono'
import { type ApiKeyRecord, getApiKey } from './api-keys.js'

declare module 'hono' {
	interface ContextVariableMap {
		apiKey: string
		apiKeyRecord: ApiKeyRecord
		apiKeySource: 'path' | 'authorization'
	}
}

function getBearerToken(c: Context): string | undefined {
	const auth = c.req.header('Authorization')
	const match = auth?.match(/^Bearer\s+(.+)$/i)
	return match?.[1]?.trim()
}

/**
 * Middleware that authenticates requests via a `tp_`-prefixed path segment or
 * Authorization bearer token.
 * e.g. `https://sponsor.tempo.xyz/tp_abc123`
 * e.g. `Authorization: Bearer tp_abc123`
 *
 * When a valid API key is present, sets `apiKey` and `apiKeyRecord` on context.
 * Requests to `/` (no key) pass through unauthenticated (preserving open access).
 */
export async function apiKeyMiddleware(c: Context, next: Next) {
	const keyParam = c.req.param('key')
	const bearerToken = getBearerToken(c)
	if (keyParam && bearerToken && keyParam !== bearerToken) {
		return c.json({ error: 'Conflicting API keys' }, 401)
	}

	const key = keyParam ?? bearerToken
	if (!key) return next()

	const record = await getApiKey(key)
	if (!record) return c.json({ error: 'Invalid or revoked API key' }, 401)

	c.set('apiKey', key)
	c.set('apiKeyRecord', record)
	c.set('apiKeySource', keyParam ? 'path' : 'authorization')

	await next()
}
