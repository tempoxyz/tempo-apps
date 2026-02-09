import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { showRoutes } from 'hono/dev'

import { Docs } from '#route.docs.tsx'
import { wagmiConfig } from '#wagmi.config.ts'
import { actionsApp } from '#route.actions.tsx'
import { geckoApp } from '#route.gecko.ts'
import OpenAPISpec from '#schema/openapi.json' with { type: 'json' }

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
			timestamp: Date.now(),
			rev: __BUILD_VERSION__,
			url: new URL(context.req.url).origin,
			chains: wagmiConfig.chains.map((_) => _.id),
			source: 'https://github.com/tempoxyz/tempo-apps/apps/api',
		}),
	)

app
	.get('/schema/openapi', (context) => context.json(OpenAPISpec))
	.get('/schema/openapi.json', (context) => context.json(OpenAPISpec))

app.route('/actions', actionsApp)
app.route('/gecko', geckoApp)

if (process.env.NODE_ENV === 'development') showRoutes(app)

export default app satisfies ExportedHandler<Cloudflare.Env>
