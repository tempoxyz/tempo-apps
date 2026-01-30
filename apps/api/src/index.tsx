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
	.get('/', (context) => context.redirect('/docs'))
	.get('/ping', (_context) => new Response('pong'))
	.get('/health', (_context) => new Response('ok'))
	.get('/docs', async (context) => context.html(<Docs />))
	.get('/version', async (context) =>
		context.json({
			timestamp: Date.now(),
			source: 'https://github.com/tempoxyz/tempo-apps',
			rev: __BUILD_VERSION__,
			chains: CHAIN_IDS,
		}),
	)

app
	.get('/schema/openapi', async (context) => context.json(OpenAPISpec))
	.get('/schema/openapi.json', async (context) => context.json(OpenAPISpec))

app.route('/actions', actionsApp)

if (process.env.NODE_ENV === 'development') showRoutes(app)

export default app satisfies ExportedHandler<Cloudflare.Env>
