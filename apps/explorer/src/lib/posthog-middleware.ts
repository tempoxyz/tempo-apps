import { waitUntil } from 'cloudflare:workers'
import { createMiddleware } from '@tanstack/react-start'
import { PostHog } from 'posthog-node'

export const posthogMiddleware = createMiddleware().server(
	async ({ request, next }) => {
		const url = new URL(request.url)

		const posthog = new PostHog(
			'phc_aNlTw2xAUQKd9zTovXeYheEUpQpEhplehCK5r1e31HR',
			{
				disabled: process.env.NODE_ENV !== 'production',
				host: 'https://us.i.posthog.com',
				flushAt: 1,
				flushInterval: 0,
			},
		)

		waitUntil(
			(async () => {
				try {
					console.log('[posthog] capturing server_request', {
						path: url.pathname,
					})
					await posthog.capture({
						distinctId: url.pathname,
						event: 'server_request',
						properties: {
							'http.path': url.pathname,
							'http.method': request.method,
							'http.full_url': url.toString(),
						},
					})
					console.log('[posthog] captured, shutting down')
					await posthog.shutdown()
					console.log('[posthog] shutdown complete')
				} catch (err) {
					console.error('[posthog] error:', err)
				}
			})(),
		)

		return await next()
	},
)
