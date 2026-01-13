import type { MiddlewareHandler } from 'hono'

// Stub rate limiter - accepts all requests for now
export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
	// TODO: Implement address and IP rate limiting
	await next()
}
