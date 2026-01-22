import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
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
		allowHeaders: ['Content-Type', 'Authorization'],
		maxAge: 86400,
	}),
)

app.get(
	'/usage',
	zValidator(
		'query',
		z.object({
			blockTimestampFrom: z.optional(z.coerce.number()),
			blockTimestampTo: z.optional(z.coerce.number()),
		}),
	),
	async (c) => {
		const { blockTimestampFrom, blockTimestampTo } = c.req.valid('query')
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
