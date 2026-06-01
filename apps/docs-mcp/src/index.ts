import { env } from 'cloudflare:workers'
import { syncSource } from './lib/ingest.js'
import { SOURCES } from './lib/sources.js'

export default {
	async fetch() {
		return new Response('docs-mcp: cron-only ingest worker\n', {
			headers: { 'content-type': 'text/plain' },
		})
	},
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
