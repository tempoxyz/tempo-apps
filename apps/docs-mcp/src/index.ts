import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { syncSource, type SyncReport } from './lib/ingest.js'
import { parseSourceList, SOURCES } from './lib/sources.js'

const app = new Hono()

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }))

app.get('/', (c) =>
	c.json({
		service: 'docs-mcp',
		description:
			'Resolver that uploads viem/wagmi/vocs docs into the tempo-global AI Search instance.',
		ai_search_instance: env.AI_SEARCH_INSTANCE_ID,
		ai_search_mcp_endpoint:
			'See AI Search dashboard → Settings → Public URL for the /mcp endpoint.',
		sources: Object.values(SOURCES).map((s) => ({
			id: s.id,
			base: s.base,
			description: s.description,
		})),
		endpoints: {
			'GET /': 'this page',
			'GET /status': 'per-source last sync timestamp and ETag',
			'POST /sync': 'sync all configured sources',
			'POST /sync/:source': 'sync a single source',
		},
	}),
)

app.get('/status', async (c) => {
	const configured = parseSourceList(env.SOURCES)
	const out = await Promise.all(
		configured.map(async (s) => ({
			source: s.id,
			base: s.base,
			last_sync: await env.ETAG_CACHE.get(`last_sync:${s.id}`),
			etag: await env.ETAG_CACHE.get(`etag:${s.id}`),
		})),
	)
	return c.json({ instance: env.AI_SEARCH_INSTANCE_ID, sources: out })
})

app.post('/sync', async (c) => {
	const configured = parseSourceList(env.SOURCES)
	const reports: SyncReport[] = []
	for (const source of configured) {
		reports.push(
			await syncSource({
				source,
				aiSearch: env.AI_SEARCH,
				instanceId: env.AI_SEARCH_INSTANCE_ID,
				etagCache: env.ETAG_CACHE,
			}),
		)
	}
	return c.json({ reports })
})

app.post('/sync/:source', async (c) => {
	const id = c.req.param('source')
	const source = SOURCES[id as keyof typeof SOURCES]
	if (!source) return c.json({ error: `unknown source: ${id}` }, 400)
	const report = await syncSource({
		source,
		aiSearch: env.AI_SEARCH,
		instanceId: env.AI_SEARCH_INSTANCE_ID,
		etagCache: env.ETAG_CACHE,
	})
	return c.json(report)
})

export default {
	fetch: app.fetch,
	async scheduled(_event, _env, ctx) {
		const configured = parseSourceList(env.SOURCES)
		ctx.waitUntil(
			(async () => {
				for (const source of configured) {
					const report = await syncSource({
						source,
						aiSearch: env.AI_SEARCH,
						instanceId: env.AI_SEARCH_INSTANCE_ID,
						etagCache: env.ETAG_CACHE,
					})
					console.log(`[cron] ${source.id}:`, JSON.stringify(report))
				}
			})(),
		)
	},
} satisfies ExportedHandler<Env>
