import { Hono } from 'hono'
import { poweredBy } from 'hono/powered-by'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'

import { indexerApp } from '#sources/index-supply.ts'

const app = new Hono<{ Bindings: Cloudflare.Env }>()

// NOTE: Order matters. Middleware runs in "onion" order:
app.use(poweredBy({ serverName: 'Tempo' }))
app.use(requestId({ headerName: 'X-Tempo-Request-Id' }))
app.use(secureHeaders()) // must come last otherwise it will reset any prior headers

app.get('/', context => context.text('tempo'))
app.get('/health', (context) => context.text('ok'))

app.route('/indexer', indexerApp)

export default app satisfies ExportedHandler<Cloudflare.Env>
