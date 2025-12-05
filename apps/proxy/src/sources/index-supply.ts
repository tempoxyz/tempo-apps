import { Hono } from 'hono'
import { proxy } from 'hono/proxy'

export const indexerApp = new Hono<{ Bindings: Cloudflare.Env }>()

const UPSTREAM_URL = 'https://api.indexsupply.net/v2'

indexerApp.on(['GET', 'POST'], '/:path', async (context) => {
	if (!context.req.query('api-key') && !context.req.header('x-api-key')) {
		return context.json({ error: 'api-key is required' }, 401)
	}

	let url = `${UPSTREAM_URL}/${context.req.param('path')}`
	const urlSearchParams = new URLSearchParams(context.req.query())

	if (urlSearchParams.size > 0) url = `${url}?${urlSearchParams}`

	const response = await proxy(url, {
		...context.req,
		headers: context.req.header(),
	})

	// `requestId` middleware doesn't get passed to sub-apps, so we add it manually
	const headers = new Headers(response.headers)
	const requestId = context.get('requestId')
	if (requestId) headers.set('X-Tempo-Request-Id', requestId)

	return new Response(response.body, { ...response, headers })
})
