import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { showRoutes } from 'hono/dev'

import { Docs } from '#docs.tsx'
import { CHAIN_IDS } from '#chains.ts'
import { OpenAPISpec } from '#schema.ts'
import { actionsApp } from '#actions.route.tsx'

const app = new Hono<{ Bindings: Cloudflare.Env }>()

app.use('*', cors())

app
	.get('/ping', (context) => context.text('pong'))
	.get('/health', (context) => context.text('ok'))
	.get('/', (context) => context.redirect('/docs'))
	.get('/docs', (context) =>
		context.html(<Docs baseUrl={new URL(context.req.url).origin} />),
	)
	.get('/version', (context) =>
		context.json({
			chains: CHAIN_IDS,
			timestamp: Date.now(),
			rev: __BUILD_VERSION__,
			url: new URL(context.req.url).origin,
			source: 'https://github.com/tempoxyz/tempo-apps/apps/api',
		}),
	)

app
	.get('/schema/openapi', (context) => context.json(OpenAPISpec))
	.get('/schema/openapi.json', (context) => context.json(OpenAPISpec))

app.route('/actions', actionsApp)

if (process.env.NODE_ENV === 'development') showRoutes(app)

export default app satisfies ExportedHandler<Cloudflare.Env>
