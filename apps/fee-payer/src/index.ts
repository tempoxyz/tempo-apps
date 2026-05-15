import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { Handler } from 'tempo.ts/server'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { Chain } from 'viem/chains'
import * as z from 'zod'
import { tempoChain } from './lib/chain.js'
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
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization'],
		maxAge: 86400,
	}),
)

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

app.all('*', rateLimitMiddleware, async (c) => {
	const requestContext = getRequestContext(c.req.raw)

	const handler = Handler.feePayer({
		account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`),
		chain: tempoChain as Chain,
		transport: http(env.TEMPO_RPC_URL ?? tempoChain.rpcUrls.default.http[0]),
		async onRequest(request) {
			// ast-grep-ignore: no-console-log
			console.info(`Sponsoring transaction: ${request.method}`)
			c.executionCtx.waitUntil(
				captureEvent({
					distinctId: requestContext.origin ?? 'unknown',
					event: FeePayerEvents.SPONSORSHIP_REQUEST,
					properties: {
						...requestContext,
						rpcMethod: request.method,
					},
				}),
			)
		},
	})
	return handler.fetch(c.req.raw)
})

export default app
