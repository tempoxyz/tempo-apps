import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

import { app } from '#index.tsx'

const whitelistedOrigin =
	env.WHITELISTED_ORIGINS.split(',')[0] ?? 'http://localhost'

describe('rate limiting', () => {
	it('allows whitelisted origins with available quota and preserves CORS', async () => {
		const rateLimiter = {
			limit: vi.fn(async () => ({ success: true })),
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
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
			whitelistedOrigin,
		)
		expect(rateLimiter.limit).toHaveBeenCalledOnce()
	})

	describe.each([
		{ method: 'GET', path: '/health' },
		{
			method: 'POST',
			path: '/v2/verify/4217/0x1234567890123456789012345678901234567890',
		},
	])('$method $path', ({ method, path }) => {
		it.each([
			whitelistedOrigin,
			'https://preview.ts.net',
			'https://evil.example',
			'invalid-origin',
			undefined,
		])('enforces exhausted quota with Origin %s', async (origin) => {
			const rateLimiter = {
				limit: vi.fn(async () => ({ success: false })),
			}
			const testEnv = {
				...env,
				RATE_LIMITER: rateLimiter,
			} as typeof env
			const headers = new Headers({ 'CF-Connecting-IP': '192.0.2.1' })
			if (origin) headers.set('Origin', origin)

			const response = await app.request(path, { method, headers }, testEnv)

			expect(response.status).toBe(429)
			expect(await response.json()).toStrictEqual({
				error: 'Rate limit exceeded',
				retryAfter: '60s',
			})
			expect(rateLimiter.limit).toHaveBeenCalledOnce()
			expect(rateLimiter.limit).toHaveBeenCalledWith({ key: '192.0.2.1' })
		})
	})

	it('preserves CORS preflight without consuming quota', async () => {
		const rateLimiter = {
			limit: vi.fn(async () => ({ success: false })),
		}
		const testEnv = {
			...env,
			RATE_LIMITER: rateLimiter,
		} as typeof env

		const response = await app.request(
			'/v2/verify/4217/0x1234567890123456789012345678901234567890',
			{
				method: 'OPTIONS',
				headers: {
					Origin: whitelistedOrigin,
					'Access-Control-Request-Method': 'POST',
				},
			},
			testEnv,
		)

		expect(response.status).toBe(204)
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
			whitelistedOrigin,
		)
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
			'GET,POST,OPTIONS,HEAD',
		)
		expect(rateLimiter.limit).not.toHaveBeenCalled()
	})
})
