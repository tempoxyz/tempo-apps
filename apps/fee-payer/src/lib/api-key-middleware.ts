import type { Context, Next } from 'hono'
import { type ApiKeyRecord, getApiKey } from './api-keys.js'

declare module 'hono' {
	interface ContextVariableMap {
		apiKey: string
		apiKeyRecord: ApiKeyRecord
	}
}

/**
 * Middleware that authenticates requests via `Authorization: Bearer <key>`.
 * When a valid API key is present, sets `apiKey` and `apiKeyRecord` on context.
 *
 * If no `Authorization` header is present the request passes through
 * unauthenticated (preserving the existing open-access behaviour).
 */
export async function apiKeyMiddleware(c: Context, next: Next) {
	const auth = c.req.header('Authorization')
	if (!auth) return next()

	const match = auth.match(/^Bearer\s+(.+)$/i)
	if (!match) return c.json({ error: 'Invalid Authorization header' }, 401)

	const key = match[1]
	const record = await getApiKey(key)
	if (!record) return c.json({ error: 'Invalid or revoked API key' }, 401)

	c.set('apiKey', key)
	c.set('apiKeyRecord', record)

	await next()
}
