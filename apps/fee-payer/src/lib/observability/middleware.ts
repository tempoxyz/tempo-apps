import type { Context, MiddlewareHandler } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { metrics } from './metrics.js'

export function httpMetrics(): MiddlewareHandler {
	return createMiddleware(async (c, next) => {
		const start = performance.now()
		let thrown: unknown

		try {
			await next()
		} catch (error) {
			thrown = error
			throw error
		} finally {
			const tags = {
				method: c.req.method,
				route: resolveRoute(c),
			}
			const errorType = thrown ? errorTypeOf(thrown) : undefined
			const status = c.res?.status ?? statusFromError(thrown)

			metrics.count('http_request_count', 1, tags)
			metrics.histogram(
				'http_response_duration_ms',
				performance.now() - start,
				tags,
			)
			metrics.count('http_response_count', 1, {
				...tags,
				status,
				...(errorType ? { error_type: errorType } : {}),
			})
			metrics.flush()
		}
	})
}

function resolveRoute(c: Context): string {
	const routePath = c.req.routePath
	if (routePath && routePath !== '/*') return routePath
	return new URL(c.req.url).pathname
}

function statusFromError(error: unknown): number {
	if (error instanceof HTTPException) return error.status
	return 500
}

function errorTypeOf(error: unknown): string {
	if (error instanceof Error) return error.constructor.name
	if (error === null) return 'null'
	return typeof error
}
