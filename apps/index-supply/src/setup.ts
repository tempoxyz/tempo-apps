import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { showRoutes } from 'hono/dev'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { timeout } from 'hono/timeout'

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
