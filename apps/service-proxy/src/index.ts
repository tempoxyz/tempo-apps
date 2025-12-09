import { env } from 'cloudflare:workers'
import { type Context, Hono, type Next } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use(
	cors({
		origin: (origin) => {
			if (!origin) return null
			const allowed = env.ALLOWED_HOSTNAMES.split(',').some(
				matchesOrigin(origin),
			)
			return allowed ? origin : null
		},
	}),
)
app.use(rateLimit)

app.all('/index-supply/*', async (c) => {
	const apiKey = env.INDEXSUPPLY_API_KEY
	if (!apiKey)
		return c.json({ error: 'INDEXSUPPLY_API_KEY not configured' }, 500)

	const reqUrl = new URL(c.req.url)
	const url = new URL(
		`${reqUrl.pathname.replace('/index-supply', '')}${reqUrl.search}`,
		'https://api.indexsupply.net',
	)

	url.searchParams.set('api-key', apiKey)

	const response = await fetch(url, {
		method: c.req.method,
		headers: c.req.raw.headers,
		body: c.req.raw.body,
	})

	const headers = new Headers()
	for (const header of ['content-type', 'cache-control', 'expires', 'etag']) {
		const value = response.headers.get(header)
		if (value) headers.set(header, value)
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	})
})

export default app

/** Rate limit middleware. */
async function rateLimit(c: Context, next: Next) {
	const ip = c.req.raw.headers.get('cf-connecting-ip') || 'unknown'
	const path = c.req.path
	const { success } = await env.REQUESTS_RATE_LIMITER.limit({
		key: `${ip}:${path}`,
	})
	if (!success) return c.json({ error: 'Rate limit exceeded' }, 429)
	await next()
}

/**
 * Checks if an origin matches an allowed hostname pattern.
 * Supports wildcard patterns like "*.example.com"
 */
function matchesOrigin(origin: string) {
	return (pattern: string) => {
		// Exact match
		if (origin === pattern) return true

		// Wildcard pattern
		if (pattern.includes('*')) {
			// Escape special regex characters except *
			const regexPattern = pattern
				.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
				.replace(/\*/g, '.*')
			const regex = new RegExp(`^${regexPattern}$`)
			return regex.test(origin)
		}

		return false
	}
}
