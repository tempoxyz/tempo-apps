import { DynamicWorkerExecutor } from '@cloudflare/codemode'
import { recordSourceFreshness } from './lib/freshness.js'
import { healthMetrics } from './lib/health.js'
import { sourceIndexStatus, syncSource } from './lib/ingest.js'
import { errorFields, log, withLogContext } from './lib/log.js'
import { handleMcp } from './lib/mcp.js'
import {
	flushWorkerMetrics,
	recordScheduledFailure,
	isFailedSyncReport,
	recordHttpRequestMetrics,
	recordIngestSummary,
	recordSourceIngestMetrics,
	recordSourceIndexStatus,
} from './lib/metrics.js'
import { captureMcpAnalytics } from './lib/posthog-mcp.js'
import { proxyMcp } from './lib/proxy.js'
import { readMcpRequest } from './lib/request.js'
import { forcedSourceIds } from './lib/schedule.js'
import { parseSources } from './lib/sources.js'
import type { Source } from './lib/sources.js'

let cachedSourcesKey: string | undefined
let cachedSources: Source[] | undefined

export default {
	async fetch(req, env, ctx) {
		const url = new URL(req.url)
		return withLogContext(
			{
				request_id: crypto.randomUUID(),
				version: env.CF_VERSION_METADATA?.id,
				traffic:
					req.headers.get('x-tempo-mcp-probe') === 'health'
						? 'synthetic'
						: 'user',
			},
			() =>
				trackRequest(req, routeName(url.pathname, req.method), async () => {
					const parsed = await readMcpRequest(req)
					if (parsed instanceof Response) return parsed
					const { request, body } = parsed
					let response: Response | undefined
					try {
						response = await handleMcp(
							request,
							{
								instance: env.AI_SEARCH.get(env.AI_SEARCH_INSTANCE_ID),
								sources: sourcesFor(env.SOURCES),
								executor: new DynamicWorkerExecutor({ loader: env.LOADER }),
							},
							body,
						)
					} catch (error) {
						log.error('mcp.local_failed', {
							...errorFields(error),
						})
					}
					if (response) {
						captureMcpAnalytics(request, body, response, env, ctx)
						return response
					}
					return proxyMcp(request, env.AI_SEARCH_MCP_URL)
				}),
		)
	},
	async scheduled(event, env, ctx) {
		const kind = event.cron === '* * * * *' ? 'health' : 'ingest'
		ctx.waitUntil(
			withLogContext(
				{ run_id: crypto.randomUUID(), version: env.CF_VERSION_METADATA?.id },
				async () => {
					try {
						if (kind === 'health') await runHealthCheck(event, env)
						else await runSync(event, env)
					} catch (error) {
						recordScheduledFailure(kind)
						log.error('cron.failed', {
							kind,
							cron: event.cron,
							...errorFields(error),
						})
						throw error
					} finally {
						flushWorkerMetrics()
					}
				},
			),
		)
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
		log.info('http.complete', {
			method: req.method,
			route,
			status: response.status,
			duration_ms: Math.round(performance.now() - startedAt),
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
		log.error('http.failed', {
			method: req.method,
			route,
			...errorFields(error),
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
	const sources = parseSources(env.SOURCES)
	const forced = forcedSourceIds(
		event.scheduledTime,
		sources.map((source) => source.id),
	)
	log.info('cron.start', {
		cron: event.cron,
		scheduled_time: new Date(event.scheduledTime).toISOString(),
		instance: env.AI_SEARCH_INSTANCE_ID,
		sources: sources.length,
		forced_sources: [...forced],
	})

	const instance = env.AI_SEARCH.get(env.AI_SEARCH_INSTANCE_ID)
	const reports = []
	for (const source of sources) {
		const report = await syncSource({
			source,
			instance,
			etagCache: env.ETAG_CACHE,
			force: forced.has(source.id),
		})
		recordSourceIngestMetrics(report, forced.has(source.id))
		flushWorkerMetrics()
		if (isFailedSyncReport(report)) log.error('source.failed', report)
		else if (report.status === 'pending_deletion')
			log.info('source.pending_deletion', report)
		else if (report.status === 'pending_index')
			log.info('source.pending_index', report)
		else log.info('source.complete', report)
		try {
			await recordSourceFreshness(env.ETAG_CACHE, report)
		} catch (error) {
			log.warn('source.freshness_failed', {
				source: source.id,
				...errorFields(error),
			})
		}
		reports.push(report)
	}
	const statusSource =
		sources[new Date(event.scheduledTime).getUTCHours() % sources.length]
	if (statusSource) {
		try {
			const status = await sourceIndexStatus(instance, statusSource.id)
			log.info('source.index_status', status)
			recordSourceIndexStatus(status)
		} catch (error) {
			log.warn('source.index_status_failed', {
				source: statusSource.id,
				...errorFields(error),
			})
		}
	}
	const durationMs = Math.round(performance.now() - startedAt)
	recordIngestSummary({ durationMs, reports })
	flushWorkerMetrics()
	log.info('cron.complete', {
		cron: event.cron,
		duration_ms: durationMs,
		sources: reports.length,
		synced: reports.filter(
			(r) => r.status === 'synced' && !isFailedSyncReport(r),
		).length,
		unchanged: reports.filter((r) => r.status === 'unchanged').length,
		pending: reports.filter(
			(r) => r.status === 'pending_deletion' || r.status === 'pending_index',
		).length,
		errors: reports.filter(isFailedSyncReport).length,
		forced_sources: [...forced],
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
