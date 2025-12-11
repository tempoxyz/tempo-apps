import { getContainer } from '@cloudflare/containers'
import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { csrf } from 'hono/csrf'
import { prettyJSON } from 'hono/pretty-json'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { timeout } from 'hono/timeout'

import { sourcifyChains } from '#chains.ts'
import { VerificationContainer } from '#container.ts'
import { docsRoute } from '#route.docs.tsx'
import { lookupAllChainContractsRoute, lookupRoute } from '#route.lookup.ts'
import { verifyRoute } from '#route.verify.ts'

export { VerificationContainer }

/**
 * TODO:
 * - CORS,
 * - Security
 * - Rate limiting,
 */

const app = new Hono<{ Bindings: Cloudflare.Env }>()

// @note: order matters
app.use('*', requestId({ headerName: 'X-Tempo-Request-Id' }))
app.use(secureHeaders())
app.use(csrf())
// TODO: update before merging to main
app.use('*', timeout(20_000)) // 20 seconds
app.use(
	'*',
	cache({
		cacheName: 'contract-verification',
		cacheControl: 'max-age=3600',
	}),
)
app.use(prettyJSON())

app.route('/docs', docsRoute)
app.route('/v2/verify', verifyRoute)
app.route('/v2/contract', lookupRoute)
app.route('/v2/contracts', lookupAllChainContractsRoute)

app
	.get('/health', (context) => context.text('ok'))
	.get('/', (context) => context.redirect('/docs'))
	.get('/chains', (context) => context.json(sourcifyChains))
	.get('/ping-container', async (context) =>
		getContainer(context.env.VERIFICATION_CONTAINER, 'singleton')
			.fetch(new Request('http://container/health'))
			.then((response) =>
				response.ok
					? context.json({ message: response.text() })
					: context.json({ error: 'Failed to ping container' }, 500),
			),
	)

export default app satisfies ExportedHandler<Cloudflare.Env>
