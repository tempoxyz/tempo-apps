import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { showRoutes } from 'hono/dev'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { timeout } from 'hono/timeout'

/**
 * A Cloudflare Worker proxying requests to https://api.indexsupply.net/v2/query
 */

const INDEX_SUPPLY_URL = 'https://api.indexsupply.net/v2/query'

export const app = new Hono<{ Bindings: Cloudflare.Env }>()

app.use(csrf())
app.use('*', timeout(4_000))
app.use(prettyJSON({ space: 2 }))
app.use(
	'*',
	cors({ origin: '*', allowMethods: ['GET', 'OPTIONS', 'POST', 'HEAD'] }),
)
app.use('*', async (context, next) => {
	logger()
	if (context.env.LOGGING === 'verbose') showRoutes(app, { verbose: true })
	await next()
})

app.notFound((context) => {
	throw new HTTPException(404, {
		cause: context.error,
		message: `${context.req.url} is not a valid path.`,
	})
})

app.get('/', async (context) => {
	const key = context.req.query('api-key')
	if (!key) return context.json({ error: 'api-key is required' }, 400)

	const query = context.req.query('query')
	if (!query) return context.json({ error: 'query is required' }, 400)

	const signatures = context.req.query('signatures')
	if (!signatures) return context.json({ error: 'signatures is required' }, 400)

	const indexSupplyUrl = new URL(INDEX_SUPPLY_URL)
	const searchParams = new URLSearchParams({
		'api-key': key,
		query,
		signatures,
	})

	const response = await fetch(`${indexSupplyUrl}?${searchParams}`, {
		method: 'GET',
	})

	if (!response.ok)
		return context.json(
			{ error: 'Failed to fetch from IndexSupply' },
			response.status as never,
		)

	const data = await response.json()
	return context.json(data)
})

export default app satisfies ExportedHandler<Cloudflare.Env>
