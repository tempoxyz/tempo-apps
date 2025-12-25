import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Handler } from 'tempo.ts/server'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { type Chain, tempoDevnet, tempoTestnet } from 'viem/chains'
import * as z from 'zod'
import { alphaUsd } from './lib/consts.js'
import { rateLimitMiddleware } from './lib/rate-limit.js'
import { getUsage } from './lib/usage.js'

const app = new Hono()

const tempoChain =
	env.TEMPO_ENV === 'devnet'
		? tempoDevnet.extend({
				feeToken: alphaUsd,
			})
		: tempoTestnet.extend({
				feeToken: alphaUsd,
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
		const data = await getUsage(
			account.address,
			blockTimestampFrom,
			blockTimestampTo,
		)

		return c.json(data)
	},
)

app.all('*', rateLimitMiddleware, async (c) => {
	const handler = Handler.feePayer({
		account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`),
		chain: tempoChain as Chain,
		transport: http(env.TEMPO_RPC_URL),
		async onRequest(request) {
			console.log(`Sponsoring transaction: ${request.method}`)
		},
	})
	return handler.fetch(c.req.raw)
})

export default app
