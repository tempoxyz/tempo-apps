import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { syncSource } from './lib/ingest.js'
import { SOURCES } from './lib/sources.js'

const app = new Hono()

app.get('/', (c) =>
	c.text(
		`docs-mcp: ingests ${SOURCES.map((s) => s.id).join(', ')} into AI Search "${env.AI_SEARCH_INSTANCE_ID}"\n`,
	),
)

app.get('/status', async (c) => {
	const status = await Promise.all(
		SOURCES.map(async (s) => ({
			source: s.id,
			last_sync: await env.ETAG_CACHE.get(`last_sync:${s.id}`),
			etag: await env.ETAG_CACHE.get(`etag:${s.id}`),
		})),
	)
	return c.json({ instance: env.AI_SEARCH_INSTANCE_ID, sources: status })
})

app.post('/sync', async (c) => {
	const only = c.req.query('source')
	const sources = only ? SOURCES.filter((s) => s.id === only) : SOURCES
	if (only && sources.length === 0) {
		return c.json({ error: `unknown source: ${only}` }, 400)
	}
	const instance = env.AI_SEARCH.get(env.AI_SEARCH_INSTANCE_ID)
	const reports = []
	for (const source of sources) {
		reports.push(
			await syncSource({ source, instance, etagCache: env.ETAG_CACHE }),
		)
	}
	return c.json({ reports })
})

export default {
	fetch: app.fetch,
	async scheduled(_event, _env, ctx) {
		const instance = env.AI_SEARCH.get(env.AI_SEARCH_INSTANCE_ID)
		ctx.waitUntil(
			(async () => {
				for (const source of SOURCES) {
					const report = await syncSource({
						source,
						instance,
						etagCache: env.ETAG_CACHE,
					})
					console.log(`[cron] ${source.id}:`, JSON.stringify(report))
				}
			})(),
		)
	},
} satisfies ExportedHandler<Env>
