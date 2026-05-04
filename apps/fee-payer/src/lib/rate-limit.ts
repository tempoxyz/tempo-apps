import { env } from 'cloudflare:workers'
import type { Context, Next } from 'hono'
import { cloneRawRequest } from 'hono/request'
import { Hex, RpcRequest } from 'ox'
import { Transaction } from 'viem/tempo'
import * as z from 'zod/mini'

/**
 * Middleware that rate limits requests based on the transaction's `from` address.
 * Extracts the transaction from the RPC request and checks against the rate limiter.
 * Fails closed: rejects requests when the binding is missing, the sender cannot
 * be identified, or the request body is malformed.
 *
 * Only applies to requests carrying a serialized 0x76 Tempo transaction.
 * Non-transaction RPC calls (e.g. eth_chainId) pass through to the handler.
 */
export async function rateLimitMiddleware(c: Context, next: Next) {
	// RPC requests are always POST. Non-POST methods (GET, OPTIONS, HEAD)
	// have no body to parse, so pass them through to the handler.
	if (c.req.method !== 'POST') return next()

	if (!env.AddressRateLimiter) {
		console.error('AddressRateLimiter binding is not configured')
		return c.json({ error: 'Service misconfigured' }, 503)
	}

	try {
		const clonedRequest = await cloneRawRequest(c.req)
		const rawBody = z.safeParse(
			z.object({
				jsonrpc: z.string(),
				id: z.number(),
				method: z.string(),
				params: z.optional(z.array(z.unknown())),
			}),
			await clonedRequest.json(),
		)
		if (!rawBody.success) return c.json({ error: 'Bad request' }, 400)

		const request = RpcRequest.from(rawBody.data)
		const serialized = request.params?.[0]

		if (
			typeof serialized === 'string' &&
			(serialized.startsWith('0x76') || serialized.startsWith('0x78'))
		) {
			if (!Hex.validate(serialized) || serialized.length < 100)
				return c.json({ error: 'Bad request' }, 400)
			const transaction = Transaction.deserialize(serialized) as {
				from?: string
			}
			const from = transaction.from

			if (!from) {
				return c.json(
					{ error: 'Unable to determine sender for rate limiting' },
					400,
				)
			}

			const { success } = await env.AddressRateLimiter.limit({ key: from })
			if (!success) return c.json({ error: 'Rate limit exceeded' }, 429)
		}
	} catch (error) {
		console.error('Rate limit middleware error:', error)
		return c.json({ error: 'Bad request' }, 400)
	}

	await next()
}
