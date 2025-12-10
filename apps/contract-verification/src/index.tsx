import { Hono } from 'hono'

import { chains } from '#chains.ts'
import { VerificationContainer } from '#container.ts'
import { Docs } from '#docs.tsx'
import { lookupAllChainContracts, lookupApp } from '#lookup.ts'
import { verifyApp } from '#verify.ts'

export { VerificationContainer }

/**
 * TODO:
 * - CORS,
 * - Security
 * - Rate limiting,
 */

const app = new Hono<{ Bindings: Cloudflare.Env }>()

app
	.get('/health', (_) => new Response('ok'))
	.get('/', async (context) => context.html(<Docs />))
	.get('/docs', async (context) => context.html(<Docs />))

app.get('/chains', (context) => context.json(chains))

app.route('/v2/verify', verifyApp)
app.route('/v2/contract', lookupApp)
app.route('/v2/contracts', lookupAllChainContracts)

export default app satisfies ExportedHandler<Cloudflare.Env>
