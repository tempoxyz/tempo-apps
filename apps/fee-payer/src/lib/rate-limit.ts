import { env } from 'cloudflare:workers'
import type { Context, Next } from 'hono'
import { cloneRawRequest } from 'hono/request'
import { RpcRequest } from 'ox'
import { Transaction } from 'viem/tempo'

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
	if (!env.AddressRateLimiter) {
		console.error('AddressRateLimiter binding is not configured')
		return c.json({ error: 'Service misconfigured' }, 503)
	}

	try {
		const clonedRequest = await cloneRawRequest(c.req)
		const request = RpcRequest.from((await clonedRequest.json()) as never)
		const serialized = request.params?.[0]

		if (
			typeof serialized === 'string' &&
			(serialized.startsWith('0x76') || serialized.startsWith('0x78'))
		) {
			const transaction = Transaction.deserialize(serialized as `0x76${string}`)
			// biome-ignore lint/suspicious/noExplicitAny: _
			const from = (transaction as any).from

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
