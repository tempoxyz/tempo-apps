import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Handler } from 'accounts/server'
import { type Context, Hono } from 'hono'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempo, tempoDevnet, tempoModerato } from 'viem/chains'
import * as z from 'zod'
import { admin } from './lib/admin.js'
import { apiKeyMiddleware } from './lib/api-key-middleware.js'
import {
	FeePayerEvents,
	captureEvent,
	getRequestContext,
} from './lib/posthog.js'
import { rateLimitMiddleware } from './lib/rate-limit.js'
import { getUsage } from './lib/usage.js'

const USAGE_CACHE_TTL = 60

const app = new Hono()

app.onError((error, c) => {
	if (error instanceof HTTPException) return error.getResponse()

	console.error('Unexpected error:', error)
	return c.text('Internal Server Error', 500)
})

app.use(
	'*',
	cors({
		origin: (origin) => {
			if (env.ALLOWED_ORIGINS === '*') return '*'
			if (origin && env.ALLOWED_ORIGINS.includes(origin)) return origin
			return null
		},
		allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization'],
		maxAge: 86400,
	}),
)

app.route('/admin', admin)

app.get(
	'/usage',
	cache({
		cacheName: 'fee-payer-usage',
		cacheControl: `public, max-age=${USAGE_CACHE_TTL}, s-maxage=${USAGE_CACHE_TTL}`,
	}),
	zValidator(
		'query',
		z.object({
			blockTimestampFrom: z.optional(z.coerce.number()),
			blockTimestampTo: z.optional(z.coerce.number()),
		}),
	),
	async (c) => {
		const query = c.req.valid('query')
		const blockTimestampFrom = query.blockTimestampFrom
			? Math.floor(query.blockTimestampFrom / USAGE_CACHE_TTL) * USAGE_CACHE_TTL
			: undefined
		const blockTimestampTo = query.blockTimestampTo
			? Math.floor(query.blockTimestampTo / USAGE_CACHE_TTL) * USAGE_CACHE_TTL
			: undefined
		const account = privateKeyToAccount(
			env.SPONSOR_PRIVATE_KEY as `0x${string}`,
		)

		const requestContext = getRequestContext(c.req.raw)
		c.executionCtx.waitUntil(
			captureEvent({
				distinctId: requestContext.origin ?? 'unknown',
				event: FeePayerEvents.USAGE_QUERY,
				properties: requestContext,
			}),
		)

		const data = await getUsage(
			account.address,
			blockTimestampFrom,
			blockTimestampTo,
		)

		return c.json(data)
	},
)

const relayHandler = Handler.relay({
	cors: false,
	features: 'all',
	feePayer: {
		account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`),
		name: 'Tempo Sponsor',
		url: 'https://sponsor.tempo.xyz',
	},
	transports: {
		[tempo.id]: http(env.TEMPO_RPC_URL ?? tempo.rpcUrls.default.http[0]),
		[tempoModerato.id]: http(tempoModerato.rpcUrls.default.http[0]),
		[tempoDevnet.id]: http(tempoDevnet.rpcUrls.default.http[0]),
	},
	async onRequest(request) {
		// ast-grep-ignore: no-console-log
		console.info(`Sponsoring transaction: ${request.method}`)
	},
})

async function feePayerHandler(c: Context) {
	const requestContext = getRequestContext(c.req.raw)
	const apiKeyLabel = c.get('apiKeyRecord')?.label
	const rpcMethod = c.get('rpcMethod') as string | undefined

	if (rpcMethod) {
		c.executionCtx.waitUntil(
			captureEvent({
				distinctId: apiKeyLabel ?? requestContext.origin ?? 'unknown',
				event: FeePayerEvents.SPONSORSHIP_REQUEST,
				properties: {
					...requestContext,
					rpcMethod,
					...(apiKeyLabel ? { apiKeyLabel } : {}),
				},
			}),
		)
	}

	const raw = c.req.raw
	const url = new URL(raw.url)
	if (url.pathname !== '/') {
		url.pathname = '/'
		return relayHandler.fetch(new Request(url, raw))
	}
	return relayHandler.fetch(raw)
}

// Keyed path: https://sponsor.tempo.xyz/tp_abc123
app.all('/:key{tp_.+}', apiKeyMiddleware, rateLimitMiddleware, feePayerHandler)

// Open path: https://sponsor.tempo.xyz/
app.all('/', rateLimitMiddleware, feePayerHandler)

export default app
