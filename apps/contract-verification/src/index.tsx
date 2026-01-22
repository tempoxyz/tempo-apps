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
import { handleError, log, originMatches, sourcifyError } from '#utilities.ts'

export { VerificationContainer }

const WHITELISTED_ORIGINS = [
	'http://localhost',
	'https://*.ts.net', // `tailscale funnel`
	...(env.WHITELISTED_ORIGINS.split(',') ?? []),
]

type AppEnv = { Bindings: Cloudflare.Env }
const factory = createFactory<AppEnv>()
const app = factory.createApp()

app.onError(handleError)

// @note: order matters
app.use('*', requestId({ headerName: 'X-Tempo-Request-Id' }))
app.use(
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
app.use(
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

const BODY_LIMIT = 4 * 1024 * 1024 // 4mb

app.use(
	bodyLimit({
		maxSize: BODY_LIMIT,
		onError: (context) => {
			log
				.fromContext(context)
				.warn('body_limit_exceeded', { maxSizeBytes: BODY_LIMIT })
			return sourcifyError(
				context,
				413,
				'body_too_large',
				'Body limit exceeded',
			)
		},
	}),
)
app.use('*', timeout(30_000)) // 30 seconds default
app.use('/verify/*', timeout(300_000)) // 5 minutes for legacy verify routes
app.use('/v2/verify/*', timeout(300_000)) // 5 minutes for v2 verify routes
app.use(prettyJSON())
app.use(async (context, next) => {
	const start = Date.now()
	await next()
	const durationMs = Date.now() - start
	const status = context.res.status
	const level = status >= 400 ? 'warn' : 'info'
	log.fromContext(context)[level]('request_completed', {
		status,
		durationMs,
		ip:
			context.req.header('CF-Connecting-IP') ??
			context.req.header('X-Forwarded-For'),
	})
})

app.route('/docs', docsRoute)
app.route('/verify', legacyVerifyRoute)
app.route('/v2/verify', verifyRoute)
app.route('/v2/contract', lookupRoute)
app.route('/v2/contracts', lookupAllChainContractsRoute)

// permanent redirect to explore.tempo.xyz favicon otherwise it shows in logs
app.get('/favicon.ico', (context) =>
	context.redirect('https://explore.tempo.xyz/favicon.ico', 301),
)

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
