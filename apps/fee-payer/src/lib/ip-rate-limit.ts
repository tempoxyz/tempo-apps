import { env } from 'cloudflare:workers'
import type { Context, Next } from 'hono'

/** Rate limit fee-payer relay requests by Cloudflare-observed client IP. */
export function ipRateLimitMiddleware(options: { keyed: boolean }) {
	return async (context: Context, next: Next) => {
		const limiter = options.keyed
			? (env.KeyedAddressRateLimiter ?? env.AddressRateLimiter)
			: env.AddressRateLimiter
		if (!limiter) {
			console.error(
				`${options.keyed ? 'KeyedAddressRateLimiter' : 'AddressRateLimiter'} binding is not configured`,
			)
			return context.json({ error: 'Service misconfigured' }, 503)
		}

		const clientIp = context.req.header('cf-connecting-ip') ?? 'unknown'
		const { success } = await limiter.limit({ key: clientIp })
		if (!success) return context.json({ error: 'Rate limit exceeded' }, 429)

		await next()
	}
}
