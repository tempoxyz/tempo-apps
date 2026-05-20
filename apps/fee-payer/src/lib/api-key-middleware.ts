import type { Context, Next } from 'hono'
import { type ApiKeyRecord, getApiKey } from './api-keys.js'

declare module 'hono' {
	interface ContextVariableMap {
		apiKey: string
		apiKeyRecord: ApiKeyRecord
	}
}

/**
 * Middleware that authenticates requests via a `tp_`-prefixed path segment.
 * e.g. `https://sponsor.tempo.xyz/tp_abc123`
 *
 * When a valid API key is present, sets `apiKey` and `apiKeyRecord` on context.
 * Requests to `/` (no key) pass through unauthenticated (preserving open access).
 */
export async function apiKeyMiddleware(c: Context, next: Next) {
	const keyParam = c.req.param('key')
	if (!keyParam) return next()

	const record = await getApiKey(keyParam)
	if (!record) return c.json({ error: 'Invalid or revoked API key' }, 401)

	c.set('apiKey', keyParam)
	c.set('apiKeyRecord', record)

	await next()
}
