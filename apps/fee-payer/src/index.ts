import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { tempo } from 'tempo.ts/chains'
import { Handler } from 'tempo.ts/server'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import * as z from 'zod'
import { GetUsageRequestSchema, getUsage } from './lib/usage.js'

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
		z.preprocess((rawQuery: Record<string, string | string[] | undefined>) => {
			const blockTimestamp: Record<string, string> = {}

			console.log('rawQuery', rawQuery)

			for (const [key, value] of Object.entries(rawQuery)) {
				if (typeof value !== 'string') continue

				const match = key.match(/^block_timestamp\[(\w+)\]$/)
				if (match?.[1]) {
					blockTimestamp[match[1]] = value
				}
			}

			console.log('blockTimestamp', blockTimestamp)

			return {
				block_timestamp:
					Object.keys(blockTimestamp).length > 0 ? blockTimestamp : undefined,
			}
		}, GetUsageRequestSchema),
	),
	async (c) => {
		const validatedQuery = c.req.valid('query')
		const account = privateKeyToAccount(
			env.SPONSOR_PRIVATE_KEY as `0x${string}`,
		)
		const data = await getUsage(account.address, validatedQuery.block_timestamp)

		return c.json(data)
	},
)

app.all('*', async (c) => {
	const handler = Handler.feePayer({
		account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`),
		chain: tempo({ feeToken: '0x20c0000000000000000000000000000000000001' }),
		transport: http(env.TEMPO_RPC_URL, {
			fetchOptions: {
				headers: {
					Authorization: `Basic ${btoa(env.TEMPO_RPC_CREDENTIALS)}`,
				},
			},
		}),
		async onRequest(request) {
			console.log(`Sponsoring transaction: ${request.method}`)
		},
	})
	return handler.fetch(c.req.raw)
})

export default app
