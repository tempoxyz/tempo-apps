import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { RpcRequest, RpcResponse } from 'ox'
import { createClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { signTransaction } from 'viem/actions'
import { Transaction } from 'viem/tempo'
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
	const request = RpcRequest.from((await c.req.json()) as never)

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

	try {
		const method = request.method as string
		if (
			method !== 'eth_signRawTransaction' &&
			method !== 'eth_sendRawTransaction' &&
			method !== 'eth_sendRawTransactionSync'
		)
			return c.json(
				RpcResponse.from(
					{
						error: new RpcResponse.MethodNotSupportedError({
							message: `Method not supported: ${request.method}`,
						}),
					},
					{ request },
				),
			)

		const serialized = request.params?.[0] as string | undefined
		if (
			typeof serialized !== 'string' ||
			(!serialized.startsWith('0x76') && !serialized.startsWith('0x78'))
		)
			throw new RpcResponse.InvalidParamsError({
				message: 'Only Tempo (0x76) transactions are supported.',
			})

		const transaction = Transaction.deserialize(
			serialized as `0x76${string}`,
		) as any
		if (!transaction.signature || !transaction.from)
			throw new RpcResponse.InvalidParamsError({
				message:
					'Transaction must be signed by the sender before fee payer signing.',
			})

		const account = privateKeyToAccount(
			env.SPONSOR_PRIVATE_KEY as `0x${string}`,
		)
		const client = createClient({
			chain: tempoChain,
			transport: http(env.TEMPO_RPC_URL ?? tempoChain.rpcUrls.default.http[0]),
		})
		const serializedTransaction = await signTransaction(client, {
			...transaction,
			account,
			feePayer: account,
		} as any)

		if (method === 'eth_signRawTransaction')
			return c.json(
				RpcResponse.from({ result: serializedTransaction }, { request }),
			)
		const result = await (client as any).request({
			method,
			params: [serializedTransaction],
		})
		return c.json(RpcResponse.from({ result }, { request }))
	} catch (error) {
		return c.json(
			RpcResponse.from(
				{
					error: new RpcResponse.InternalError({
						message: (error as Error).message,
					}),
				},
				{ request },
			),
		)
	}
})

export default app
