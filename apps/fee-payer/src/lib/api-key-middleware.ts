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
 * Requests without a key pass through unless authentication is required.
 */
export function apiKeyMiddleware(options: apiKeyMiddleware.Options = {}) {
	return async function authenticateApiKey(c: Context, next: Next) {
		const keyParam = c.req.param('key')
		if (!keyParam) {
			if (options.required) return c.json({ error: 'API key required' }, 401)
			return next()
		}

		const record = await getApiKey(keyParam)
		if (!record) return c.json({ error: 'Invalid or revoked API key' }, 401)

		c.set('apiKey', keyParam)
		c.set('apiKeyRecord', record)

		await next()
	}
}

export declare namespace apiKeyMiddleware {
	type Options = {
		required?: boolean | undefined
	}
}
