import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Handler } from 'accounts/server'
import { type Context, Hono } from 'hono'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { privateKeyToAccount } from 'viem/accounts'
import { admin } from './lib/admin.js'
import { apiKeyMiddleware } from './lib/api-key-middleware.js'
import { tempoChain } from './lib/chain.js'
import { pathUsd } from './lib/consts.js'
import { metrics } from './lib/observability/metrics.js'
import { httpMetrics, rpcMetrics } from './lib/observability/middleware.js'
import {
	FeePayerEvents,
	captureEvent,
	getRequestContext,
} from './lib/posthog.js'
import { ipRateLimitMiddleware } from './lib/ip-rate-limit.js'
import { serveLlms } from './lib/llms/serve.js'
import { createRpcTransport } from './lib/rpc.js'
import { sponsorshipPolicyMiddleware } from './lib/sponsorship-policy.js'
import { getUsage, UsageQuerySchema } from './lib/usage.js'

const USAGE_CACHE_TTL = 60

const sponsorAccount = privateKeyToAccount(
	env.SPONSOR_PRIVATE_KEY as `0x${string}`,
)

const relayHandler = Handler.relay({
	cors: false,
	chains: [tempoChain],
	// Sponsorship needs a chain fill and local fee-payer signature. Optional
	// relay enrichment adds a serial post-fill simulation before responding.
	feePayer: {
		account: sponsorAccount,
		// Always use PathUSD as fee token.
		feeToken: pathUsd,
		name: 'Tempo Sponsor',
		url: 'https://sponsor.tempo.xyz',
	},
	transports: {
		[tempoChain.id]: createRpcTransport(
			env.TEMPO_RPC_URL,
			tempoChain.rpcUrls.default.http[0],
			env,
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
	const url = new URL(raw.url)
	const target =
		url.pathname === '/' ? raw : new Request(new URL('/', url), raw)

	const relayStart = performance.now()
	const response = await relayHandler.fetch(target)
	metrics.histogram(
		'fee_payer_relay_duration_ms',
		performance.now() - relayStart,
		{
			caller_service:
				apiKeyRecord?.callerService ?? apiKeyRecord?.label ?? 'anonymous',
			rpc_method: rpcMethod ?? 'unknown',
			keyed_route: String(Boolean(apiKey)),
		},
	)
	return response
}

const app = new Hono()
	.onError((error, c) => {
		if (error instanceof HTTPException) return error.getResponse()

		console.error('Unexpected error:', error)
		return c.text('Internal Server Error', 500)
	})
	.use('*', httpMetrics())
	.use(
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
	.route('/admin', admin)
	.get(
		'/usage',
		cache({
			cacheName: 'fee-payer-usage',
			cacheControl: `public, max-age=${USAGE_CACHE_TTL}, s-maxage=${USAGE_CACHE_TTL}`,
		}),
		zValidator('query', UsageQuerySchema),
		async (c) => {
			const query = c.req.valid('query')
			const blockTimestampFrom = query.blockTimestampFrom
				? Math.floor(query.blockTimestampFrom / USAGE_CACHE_TTL) *
					USAGE_CACHE_TTL
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
	.get('/llms.txt', () => llmsResponse('llms.txt'))
	.get('/llms-full.txt', () => llmsResponse('llms-full.txt'))
	// Keyed path: https://sponsor.tempo.xyz/tp_abc123
	.all(
		'/:key{tp_.+}',
		apiKeyMiddleware(),
		rpcMetrics({ keyed: true }),
		ipRateLimitMiddleware({ keyed: true }),
		sponsorshipPolicyMiddleware,
		feePayerHandler,
	)
	// Open path: https://sponsor.tempo.xyz/
	.all(
		'/',
		apiKeyMiddleware({ required: env.TEMPO_ENV === 'mainnet' }),
		rpcMetrics({ keyed: false }),
		ipRateLimitMiddleware({ keyed: false }),
		sponsorshipPolicyMiddleware,
		feePayerHandler,
	)

export type App = typeof app

const llmsResponse = serveLlms(app)

export default app
