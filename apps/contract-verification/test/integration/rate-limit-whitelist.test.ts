import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

import { app } from '#index.tsx'

const whitelistedOrigin = env.WHITELISTED_ORIGINS.split(',')[0] ?? 'http://localhost'

describe('rate limit whitelist', () => {
	it('skips rate limiting for whitelisted origins', async () => {
		const rateLimiter = {
			limit: vi.fn(async () => ({ success: false })),
		}
		const testEnv = {
			...env,
			RATE_LIMITER: rateLimiter,
		} as typeof env

		const response = await app.request(
			'/health',
			{
				headers: {
					Origin: whitelistedOrigin,
				},
			},
			testEnv,
		)

		expect(response.status).toBe(200)
		expect(await response.text()).toBe('ok')
		expect(rateLimiter.limit).not.toHaveBeenCalled()
	})

	it('still rate limits non-whitelisted origins', async () => {
		const rateLimiter = {
			limit: vi.fn(async () => ({ success: false })),
		}
		const testEnv = {
			...env,
			RATE_LIMITER: rateLimiter,
		} as typeof env

		const response = await app.request(
			'/health',
			{
				headers: {
					Origin: 'https://evil.example',
				},
			},
			testEnv,
		)

		expect(response.status).toBe(429)
		expect(await response.json()).toStrictEqual({
			error: 'Rate limit exceeded',
			retryAfter: '60s',
		})
		expect(rateLimiter.limit).toHaveBeenCalledOnce()
	})
})
