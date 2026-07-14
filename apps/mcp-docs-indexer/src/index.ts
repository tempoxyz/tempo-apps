import { DynamicWorkerExecutor } from '@cloudflare/codemode'
import { healthMetrics } from './lib/health.js'
import { syncSource } from './lib/ingest.js'
import { log } from './lib/log.js'
import { handleMcp } from './lib/mcp.js'
import {
	flushWorkerMetrics,
	recordHttpRequestMetrics,
	recordIngestMetrics,
} from './lib/metrics.js'
import { captureMcpAnalytics, parseJsonRpcRequest } from './lib/posthog-mcp.js'
import { proxyMcp } from './lib/proxy.js'
import { isForcedHour } from './lib/schedule.js'
import { parseSources } from './lib/sources.js'
import type { Source } from './lib/sources.js'

let cachedSourcesKey: string | undefined
let cachedSources: Source[] | undefined

export default {
	async fetch(req, env, ctx) {
		const url = new URL(req.url)
		return trackRequest(req, routeName(url.pathname, req.method), async () => {
			const jsonRpcRequest = await parseJsonRpcRequest(req)
			let response: Response | undefined
			try {
				response = await handleMcp(req, {
					instance: env.AI_SEARCH.get(env.AI_SEARCH_INSTANCE_ID),
					sources: sourcesFor(env.SOURCES),
					executor: new DynamicWorkerExecutor({ loader: env.LOADER }),
				})
			} catch (error) {
				log.error('mcp.local_failed', {
					error: error instanceof Error ? error.message : String(error),
				})
			}
			if (response) {
				captureMcpAnalytics(req, jsonRpcRequest, response, env, ctx)
				return response
			}
			return proxyMcp(req, env.AI_SEARCH_MCP_URL)
		})
	},
	async scheduled(event, env, ctx) {
		if (event.cron === '* * * * *') {
			ctx.waitUntil(runHealthCheck(event, env))
			return
		}
		ctx.waitUntil(runSync(event, env))
	},
} satisfies ExportedHandler<Env>

async function trackRequest(
	req: Request,
	route: string,
	handler: () => Promise<Response>,
): Promise<Response> {
	const startedAt = performance.now()
	try {
		const response = await handler()
		recordHttpRequestMetrics({
			durationMs: Math.round(performance.now() - startedAt),
			method: req.method,
			route,
			status: response.status,
		})
		return response
	} catch (error) {
		recordHttpRequestMetrics({
			durationMs: Math.round(performance.now() - startedAt),
			method: req.method,
			route,
			status: 500,
			thrown: true,
		})
		throw error
	} finally {
		flushWorkerMetrics()
	}
}

async function runHealthCheck(
	event: ScheduledController,
	env: Env,
): Promise<void> {
	const startedAt = performance.now()
	await healthMetrics(env)
	flushWorkerMetrics()
	log.info('mcp.health_complete', {
		cron: event.cron,
		scheduled_time: new Date(event.scheduledTime).toISOString(),
		duration_ms: Math.round(performance.now() - startedAt),
	})
}

async function runSync(event: ScheduledController, env: Env): Promise<void> {
	const startedAt = performance.now()
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
	const durationMs = Math.round(performance.now() - startedAt)
	recordIngestMetrics({ durationMs, force, reports })
	flushWorkerMetrics()
	log.info('cron.complete', {
		cron: event.cron,
		duration_ms: durationMs,
		sources: reports.length,
		synced: reports.filter((r) => r.status === 'synced').length,
		unchanged: reports.filter((r) => r.status === 'unchanged').length,
		errors: reports.filter((r) => r.status === 'error').length,
		force,
	})
}

function routeName(pathname: string, method: string): string {
	if (method === 'OPTIONS') return 'options'
	if (method === 'POST' && (pathname === '/' || pathname === '/mcp')) {
		return 'mcp'
	}
	if (pathname === '/') return 'root'
	return 'proxy'
}

function sourcesFor(config: Env['SOURCES']): Source[] {
	const key = typeof config === 'string' ? config : JSON.stringify(config)
	if (cachedSources && cachedSourcesKey === key) return cachedSources
	cachedSourcesKey = key
	cachedSources = parseSources(config)
	return cachedSources
}
