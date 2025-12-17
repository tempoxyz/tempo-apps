import { getContainer } from '@cloudflare/containers'
import { Hono } from 'hono'
import { showRoutes } from 'hono/dev'
import { prettyJSON } from 'hono/pretty-json'
import { requestId } from 'hono/request-id'
import { timeout } from 'hono/timeout'

import { sourcifyChains } from '#chains.ts'
import { VerificationContainer } from '#container.ts'
import OpenApiSpec from '#openapi.json' with { type: 'json' }
import packageJSON from '#package.json' with { type: 'json' }
import { docsRoute } from '#route.docs.tsx'
import { lookupAllChainContractsRoute, lookupRoute } from '#route.lookup.ts'
import { verifyRoute } from '#route.verify.ts'
import { legacyVerifyRoute } from '#route.verify-legacy.ts'

export { VerificationContainer }

/**
 * TODO:
 * - CORS,
 * - Cache,
 * - Security
 * - Rate limiting,
 */

const app = new Hono<{ Bindings: Cloudflare.Env }>()

// @note: order matters
app.use('*', requestId({ headerName: 'X-Tempo-Request-Id' }))
// TODO: update before merging to main
app.use('*', timeout(20_000)) // 20 seconds
app.use(prettyJSON())

app.route('/docs', docsRoute)
app.route('/verify', legacyVerifyRoute)
app.route('/v2/verify', verifyRoute)
app.route('/v2/contract', lookupRoute)
app.route('/v2/contracts', lookupAllChainContractsRoute)

app
	.get('/health', (context) => context.text('ok'))
	.get('/', (context) => context.redirect('/docs'))
	// TODO: match sourcify `https://sourcify.dev/server/chains` response schema
	.get('/chains', (context) => context.json(sourcifyChains))
	.get('/version', async (context) =>
		context.json({
			version: packageJSON.version,
			gitCommitHash: __BUILD_VERSION__,
		}),
	)
	.get('/openapi.json', (context) => context.json(OpenApiSpec))
	.get('/ping-container', async (context) =>
		getContainer(context.env.VERIFICATION_CONTAINER, 'singleton')
			.fetch(new Request('http://container/health'))
			.then((response) =>
				response.ok
					? context.json({ message: 'ok' })
					: context.json({ error: 'Failed to ping container' }, 500),
			),
	)

app.use('*', async (context, next) => {
	if (context.env.NODE_ENV !== 'development') return await next()
	console.info(`[${context.req.method}] ${context.req.path}`)
	await next()
})

showRoutes(app)

export default app satisfies ExportedHandler<Cloudflare.Env>
