import { env } from 'cloudflare:workers'
import { type Context, Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { ipRateLimitMiddleware } from './lib/ip-rate-limit.js'
import { forward, readConfig, resolveApiKey } from './lib/proxy.js'

/**
 * Legacy sponsor endpoint (sponsor.tempo.xyz and its testnet aliases).
 * Sponsorship itself now happens in Tempo API; this Worker only maps the
 * caller to a Tempo API key and forwards the JSON-RPC body to
 * https://api.tempo.xyz/rpc/sponsor/<chainId>.
 */
async function sponsor(c: Context) {
	const config = readConfig(env)
	const resolution = resolveApiKey(config, c.req.param('key'))
	if (!resolution.ok)
		return c.json({ error: resolution.error }, resolution.status)
	return forward(c.req.raw, {
		apiKey: resolution.apiKey,
		chainId: config.chainId,
	})
}

const app = new Hono()
	.onError((error, c) => {
		if (error instanceof HTTPException) return error.getResponse()
		console.error('Unexpected error:', error)
		return c.text('Internal Server Error', 500)
	})
	.use(
		'*',
		cors({
			origin: '*',
			allowMethods: ['POST', 'OPTIONS'],
			allowHeaders: ['Content-Type'],
			maxAge: 86400,
		}),
	)
	.get('/', (c) =>
		c.text(
			'Tempo fee sponsorship has moved to https://api.tempo.xyz/rpc/sponsor. See https://docs.tempo.xyz.',
		),
	)
	// Keyed path: https://sponsor.tempo.xyz/tp_abc123
	.post('/:key{tp_.+}', ipRateLimitMiddleware({ keyed: true }), sponsor)
	// Open path: https://sponsor.testnet.tempo.xyz/
	.post('/', ipRateLimitMiddleware({ keyed: false }), sponsor)

export type App = typeof app

export default app
