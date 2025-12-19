import { env } from 'cloudflare:workers'
import { getContainer } from '@cloudflare/containers'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { showRoutes } from 'hono/dev'
import { createFactory } from 'hono/factory'
import { prettyJSON } from 'hono/pretty-json'
import { requestId } from 'hono/request-id'
import { timeout } from 'hono/timeout'
import { rateLimiter } from 'hono-rate-limiter'
import { sourcifyChains } from '#chains.ts'
import { VerificationContainer } from '#container.ts'
import OpenApiSpec from '#openapi.json' with { type: 'json' }
import packageJSON from '#package.json' with { type: 'json' }
import { docsRoute } from '#route.docs.tsx'
import { lookupAllChainContractsRoute, lookupRoute } from '#route.lookup.ts'
import { verifyRoute } from '#route.verify.ts'
import { legacyVerifyRoute } from '#route.verify-legacy.ts'
import { originMatches } from '#utilities.ts'

export { VerificationContainer }

const WHITELISTED_ORIGINS = [
	'http://localhost',
	'https://*.ts.net', // `tailscale funnel`
	...(env.WHITELISTED_ORIGINS.split(',') ?? []),
]

type AppEnv = { Bindings: Cloudflare.Env }
const factory = createFactory<AppEnv>()
const app = factory.createApp()

// @note: order matters
app
	.use('*', requestId({ headerName: 'X-Tempo-Request-Id' }))
	.use(
		cors({
			allowMethods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
			origin: (origin, _) => {
				return WHITELISTED_ORIGINS.some((p) =>
					originMatches({ origin, pattern: p }),
				)
					? origin
					: null
			},
		}),
	)
	.use(
		rateLimiter<AppEnv>({
			binding: (context) => context.env.RATE_LIMITER,
			keyGenerator: (context) =>
				(context.req.header('X-Real-IP') ??
					context.req.header('CF-Connecting-IP') ??
					context.req.header('X-Forwarded-For')) ||
				'',
			skip: (context) =>
				WHITELISTED_ORIGINS.some((p) =>
					originMatches({
						origin: new URL(context.req.url).hostname,
						pattern: p,
					}),
				),
			message: { error: 'Rate limit exceeded', retryAfter: '60s' },
		}),
	)
	.use(bodyLimit({ maxSize: 2 * 10_24 })) // 1mb
	.use('*', timeout(12_000)) // 12 seconds
	.use(prettyJSON())
	.use(async (context, next) => {
		if (context.env.NODE_ENV !== 'development') return await next()
		const baseLogMessage = `${context.get('requestId')}-[${context.req.method}] ${context.req.path}`
		if (context.req.method === 'GET') {
			console.info(`${baseLogMessage}\n`)
			return await next()
		}
		const body = await context.req.text()
		console.info(`${baseLogMessage} \n${body}\n`)
		return await next()
	})

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

showRoutes(app)

export default app satisfies ExportedHandler<Cloudflare.Env>
