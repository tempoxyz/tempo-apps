import { env } from 'cloudflare:workers'
import { syncSource } from './lib/ingest.js'
import { log } from './lib/log.js'
import { handleMcp } from './lib/mcp.js'
import { captureMcpAnalytics, parseJsonRpcRequest } from './lib/posthog-mcp.js'
import { proxyMcp } from './lib/proxy.js'
import { isForcedHour } from './lib/schedule.js'
import { parseSources } from './lib/sources.js'
import type { Source } from './lib/sources.js'

let cachedSourcesKey: string | undefined
let cachedSources: Source[] | undefined

export default {
	async fetch(req, env, ctx) {
		const jsonRpcRequest = await parseJsonRpcRequest(req)
		const response = await handleMcp(req, {
			instance: env.AI_SEARCH.get(env.AI_SEARCH_INSTANCE_ID),
			sources: sourcesFor(env.SOURCES),
		})
		if (response) {
			captureMcpAnalytics(req, jsonRpcRequest, response, env, ctx)
			return response
		}
		return proxyMcp(req, env.AI_SEARCH_MCP_URL)
	},
	async scheduled(event) {
		const startedAt = performance.now()
		// Once per UTC day, bypass all ETag caches as a backstop for sources
		// whose llms.txt ETag doesn't track page changes correctly.
		const force = isForcedHour(event.scheduledTime)
		const sources = parseSources(env.SOURCES)
		log.info('cron.start', {
			cron: event.cron,
			scheduled_time: new Date(event.scheduledTime).toISOString(),
			instance: env.AI_SEARCH_INSTANCE_ID,
			sources: sources.length,
			force,
		})

		const instance = env.AI_SEARCH.get(env.AI_SEARCH_INSTANCE_ID)
		const reports = []
		for (const source of sources) {
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

function sourcesFor(config: Env['SOURCES']): Source[] {
	const key = typeof config === 'string' ? config : JSON.stringify(config)
	if (cachedSources && cachedSourcesKey === key) return cachedSources
	cachedSourcesKey = key
	cachedSources = parseSources(config)
	return cachedSources
}
