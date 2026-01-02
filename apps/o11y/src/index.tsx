import { Hono } from 'hono'
import { cache } from 'hono/cache'

const API_HOST = 'us.i.posthog.com'
const ASSET_HOST = 'us-assets.i.posthog.com'

const app = new Hono<{ Bindings: Cloudflare.Env }>()

// Static assets with caching
app.get(
	'/static/*',
	cache({
		cacheName: 'posthog-static-assets',
		cacheControl: 'max-age=31536000', // 1 year for static assets
	}),
	async (context) => {
		const url = new URL(context.req.url)
		const pathWithParams = url.pathname + url.search
		return fetch(`https://${ASSET_HOST}${pathWithParams}`)
	},
)

// Forward all other requests to PostHog API
app.all('*', async (context) => {
	const request = context.req.raw
	const url = new URL(request.url)
	const pathWithParams = url.pathname + url.search

	const ip = request.headers.get('CF-Connecting-IP') || ''
	const originHeaders = new Headers(request.headers)
	originHeaders.delete('cookie')
	originHeaders.set('X-Forwarded-For', ip)

	const body = 	request.method !== 'GET' && request.method !== 'HEAD'
		? await request.arrayBuffer()
		: null
	const originRequest = new Request(`https://${API_HOST}${pathWithParams}`, {
		body,
		headers: originHeaders,
		method: request.method,
		redirect: request.redirect,
	})

	return fetch(originRequest)
})

export default app satisfies ExportedHandler<Cloudflare.Env>
