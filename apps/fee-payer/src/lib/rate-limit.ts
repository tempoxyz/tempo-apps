import { env } from 'cloudflare:workers'
import type { Context, Next } from 'hono'
import { cloneRawRequest } from 'hono/request'
import { RpcRequest } from 'ox'
import { Transaction } from 'viem/tempo'

/**
 * Middleware that rate limits requests based on the transaction's `from` address.
 * Extracts the transaction from the RPC request and checks against the rate limiter.
 * Returns 429 if rate limit is exceeded.
 */
export async function rateLimitMiddleware(c: Context, next: Next) {
	if (!env.AddressRateLimiter) {
		return next()
	}

	try {
		const clonedRequest = await cloneRawRequest(c.req)
		// biome-ignore lint/suspicious/noExplicitAny: RpcRequest.from accepts any JSON-RPC payload
		// ast-grep-ignore: no-explicit-any
		const request = RpcRequest.from((await clonedRequest.json()) as any)
		const serialized = request.params?.[0] as `0x76${string}`

		if (serialized?.startsWith('0x76')) {
			const transaction = Transaction.deserialize(serialized)
			// biome-ignore lint/suspicious/noExplicitAny: Transaction type doesn't expose `from` property
			// ast-grep-ignore: no-explicit-any
			const from = (transaction as any).from

			const { success } = await env.AddressRateLimiter.limit({ key: from })
			if (!success) return c.json({ error: 'Rate limit exceeded' }, 429)
		}
	} catch {
		// Let unparseable requests through - handler will return appropriate error
	}

	await next()
}
