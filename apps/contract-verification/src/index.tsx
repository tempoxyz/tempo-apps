import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'

import { tempoDevnet, tempoTestnet } from '#chains.ts'
import { Docs } from '#docs.tsx'
import { lookupApp } from '#lookup.ts'
import { verifyApp } from '#verify.ts'

const app = new Hono<{ Bindings: Cloudflare.Env }>()

const _CHAIN_IDS = [tempoDevnet.id, tempoTestnet.id]

app
	.get('/health', (_) => new Response('ok'))
	.get('/', async (context) => context.html(<Docs />))
	.get('/docs', async (context) => context.html(<Docs />))

app.get('/d1', async (context) => {
	const db = drizzle(context.env.CONTRACTS_DB)
	const result = await db.get<{ ok: number }>(sql`SELECT 1 as ok`)
	if (!result?.ok) return context.json({ status: 'error' }, 500)

	const tables = await db.all<{ name: string }>(
		sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`,
	)
	return context.json({
		status: 'connected',
		tables: tables.map((t) => t.name),
	})
})

app.get('/chains', (context) =>
	context.json({
		[tempoDevnet.id]: tempoDevnet,
		[tempoTestnet.id]: tempoTestnet,
	}),
)

app.route('/v2/verify', verifyApp)
app.route('/v2/contract', lookupApp)

export default app satisfies ExportedHandler<Cloudflare.Env>
