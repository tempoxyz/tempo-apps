import type { Context, Next } from 'hono'

/** Requires mainnet sponsorship requests to use the API-key route. */
export function mainnetApiKeyMiddleware(
	options: mainnetApiKeyMiddleware.Options,
) {
	return async function mainnetApiKey(c: Context, next: Next) {
		if (options.tempoEnv === 'mainnet') {
			return c.json({ error: 'API key required' }, 401)
		}

		await next()
	}
}

export declare namespace mainnetApiKeyMiddleware {
	type Options = {
		tempoEnv: string
	}
}
