import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Handler, Kv } from 'tempo.ts/server'

const app = new Hono()

app.use(
	'*',
	cors({
		origin: (origin) => {
			if (env.ALLOWED_ORIGINS === '*') return '*'
			if (origin && env.ALLOWED_ORIGINS.includes(origin)) return origin
			return null
		},
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
		maxAge: 86400,
	}),
)

const handler = Handler.keyManager({
	kv: Kv.cloudflare(env.KEYS_KV),
	path: '/keys',
	// Only set rp if RP_ID is explicitly configured - allows any origin otherwise
	...(env.RP_ID ? { rp: env.RP_ID } : {}),
})

app.use(async (c) => {
	if (c.req.method === 'POST') {
		const body = await c.req.text()
		console.log('POST URL:', c.req.url)
		console.log('POST body length:', body.length)
		console.log('POST body:', body.substring(0, 2000))
		try {
			const parsed = JSON.parse(body)
			console.log('Parsed keys:', Object.keys(parsed))
			if (parsed.credential) {
				console.log('credential keys:', Object.keys(parsed.credential))
				if (parsed.credential.response) {
					console.log(
						'credential.response keys:',
						Object.keys(parsed.credential.response),
					)
				}
			}
		} catch (e) {
			console.log('Parse error:', e)
		}
		// Recreate request with body
		const newReq = new Request(c.req.raw.url, {
			method: 'POST',
			headers: c.req.raw.headers,
			body,
		})
		try {
			return await handler.fetch(newReq)
		} catch (e) {
			console.error('Handler error:', e)
			return c.json({ error: String(e) }, 500)
		}
	}
	try {
		return await handler.fetch(c.req.raw)
	} catch (e) {
		console.error('Handler error:', e)
		return c.json({ error: String(e) }, 500)
	}
})

export default app
