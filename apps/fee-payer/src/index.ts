import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Handler } from 'accounts/server'
import { type Context, Hono } from 'hono'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import * as z from 'zod'
import { admin } from './lib/admin.js'
import { apiKeyMiddleware } from './lib/api-key-middleware.js'
import { enqueueSponsorshipIntent } from './lib/billing.js'
import { tempoChain } from './lib/chain.js'
import { pathUsd } from './lib/consts.js'
import { httpMetrics, rpcMetrics } from './lib/observability/middleware.js'
import {
	FeePayerEvents,
	captureEvent,
	getRequestContext,
} from './lib/posthog.js'
import { rateLimitMiddleware } from './lib/rate-limit.js'
import { getUsage } from './lib/usage.js'

const USAGE_CACHE_TTL = 60
const ATTRIBUTION_KEY_HEADER = 'x-tempo-attribution-key'

const app = new Hono()

app.onError((error, c) => {
	if (error instanceof HTTPException) return error.getResponse()

	console.error('Unexpected error:', error)
	return c.text('Internal Server Error', 500)
})

app.use('*', httpMetrics())

app.use(
	'*',
	cors({
		origin: (origin) => {
			if (env.ALLOWED_ORIGINS === '*') return '*'
			if (origin && env.ALLOWED_ORIGINS.includes(origin)) return origin
			return null
		},
		allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization', ATTRIBUTION_KEY_HEADER],
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

const sponsorAccount = privateKeyToAccount(
	env.SPONSOR_PRIVATE_KEY as `0x${string}`,
)

const relayHandler = Handler.relay({
	cors: false,
	chains: [tempoChain],
	features: 'all',
	feePayer: {
		account: sponsorAccount,
		// Always use PathUSD as fee token.
		feeToken: pathUsd,
		name: 'Tempo Sponsor',
		url: 'https://sponsor.tempo.xyz',
	},
	transports: {
		[tempoChain.id]: http(
			env.TEMPO_RPC_URL ?? tempoChain.rpcUrls.default.http[0],
		),
	},
})

async function feePayerHandler(c: Context) {
	const requestContext = getRequestContext(c.req.raw)
	const apiKey = c.get('apiKey') as string | undefined
	const apiKeyRecord = c.get('apiKeyRecord')
	const apiKeyLabel = apiKeyRecord?.label
	const rpcMethod = c.get('rpcMethod') as string | undefined
	const estimatedFeeUsd = c.get('estimatedFeeUsd') as number | undefined
	const attributionKey =
		c.req.header(ATTRIBUTION_KEY_HEADER)?.trim() || undefined

	if (rpcMethod) {
		c.executionCtx.waitUntil(
			captureEvent({
				distinctId: apiKeyLabel ?? requestContext.origin ?? 'unknown',
				event: FeePayerEvents.SPONSORSHIP_REQUEST,
				properties: {
					...requestContext,
					rpcMethod,
					keyedRoute: Boolean(apiKey),
					...(apiKeyLabel ? { apiKeyLabel } : {}),
					...(apiKeyRecord?.dailyLimitUsd
						? { dailyLimitUsd: apiKeyRecord.dailyLimitUsd }
						: {}),
					...(estimatedFeeUsd !== undefined ? { estimatedFeeUsd } : {}),
				},
			}),
		)
	}

	const raw = c.req.raw
	const billingRequest =
		apiKey && apiKeyRecord?.billable ? raw.clone() : undefined
	const billingSignedAt = billingRequest ? new Date().toISOString() : undefined
	const url = new URL(raw.url)
	const target =
		url.pathname === '/' ? raw : new Request(new URL('/', url), raw)

	const response = await relayHandler.fetch(target)
	if (apiKey && billingRequest && apiKeyRecord?.billable) {
		c.executionCtx.waitUntil(
			enqueueSponsorshipIntent({
				apiKey,
				attributionKey,
				fallbackChainId: tempoChain.id,
				request: billingRequest,
				response: response.clone(),
				signedAt: billingSignedAt,
				sponsorAddress: sponsorAccount.address,
			}),
		)
	}

	return response
}

// Keyed path: https://sponsor.tempo.xyz/tp_abc123
app.all(
	'/:key{tp_.+}',
	rpcMetrics({ keyed: true }),
	apiKeyMiddleware,
	rateLimitMiddleware({ keyed: true }),
	feePayerHandler,
)

// Open path: https://sponsor.tempo.xyz/
app.all(
	'/',
	rpcMetrics({ keyed: false }),
	rateLimitMiddleware({ keyed: false }),
	feePayerHandler,
)

export default app
