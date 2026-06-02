import { env } from 'cloudflare:workers'
import { handleCodemodeRequest } from './lib/codemode.js'
import { syncSource } from './lib/ingest.js'
import { log } from './lib/log.js'
import { proxyMcp } from './lib/proxy.js'
import { isForcedHour } from './lib/schedule.js'
import { SOURCES } from './lib/sources.js'

export default {
	async fetch(req) {
		const { pathname } = new URL(req.url)
		// /codemode wraps the AI Search MCP tools in a single sandboxed
		// `code` tool. Everything else is proxied 1:1 to the upstream
		// AI Search MCP endpoint.
		if (pathname === '/codemode') {
			return handleCodemodeRequest(req, {
				upstreamUrl: env.AI_SEARCH_MCP_URL,
				loader: env.LOADER,
			})
		}
		return proxyMcp(req, env.AI_SEARCH_MCP_URL)
	},
	async scheduled(event) {
		const startedAt = performance.now()
		// Once per UTC day, bypass all ETag caches as a backstop for sources
		// whose llms.txt ETag doesn't track page changes correctly.
		const force = isForcedHour(event.scheduledTime)
		log.info('cron.start', {
			cron: event.cron,
			scheduled_time: new Date(event.scheduledTime).toISOString(),
			instance: env.AI_SEARCH_INSTANCE_ID,
			sources: SOURCES.length,
			force,
		})

		const instance = env.AI_SEARCH.get(env.AI_SEARCH_INSTANCE_ID)
		const reports = []
		for (const source of SOURCES) {
			const report = await syncSource({
				source,
				instance,
				etagCache: env.ETAG_CACHE,
				force,
			})
			if (report.status === 'error') log.error('source.failed', report)
			else log.info('source.complete', report)
			reports.push(report)
		}
		log.info('cron.complete', {
			cron: event.cron,
			duration_ms: Math.round(performance.now() - startedAt),
			sources: reports.length,
			synced: reports.filter((r) => r.status === 'synced').length,
			unchanged: reports.filter((r) => r.status === 'unchanged').length,
			errors: reports.filter((r) => r.status === 'error').length,
			force,
		})
	},
} satisfies ExportedHandler<Env>
