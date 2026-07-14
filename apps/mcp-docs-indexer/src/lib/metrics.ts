import { createMetrics } from 'cloudflare-worker-metrics'
import type { SyncReport } from './ingest.js'

type EmptyTags = Record<string, never>
type HttpTags = { method: string; route: string; status_class: string }
type EndpointTags = { endpoint: string }
type HealthCheckTags = EndpointTags & { check: string }
type JsonRpcErrorTags = {
	error_code: string
	mcp_method: string
	tool_name: string
}
type ToolTags = { outcome: string; tool_name: string }
type AiSearchTags = { path: string; source_filter: string }
type ProxyTags = { status_class: string }
type SourceTags = { force: string; source: string; status: string }

type DocsMcpMetricRegistry = {
	tempo_docs_mcp_http_request_count: HttpTags
	tempo_docs_mcp_http_response_duration_ms: HttpTags
	tempo_docs_mcp_http_error_count: HttpTags & { error_class: string }
	tempo_docs_mcp_health_ok: EndpointTags
	tempo_docs_mcp_health_duration_ms: EndpointTags
	tempo_docs_mcp_health_check_ok: HealthCheckTags
	tempo_docs_mcp_health_check_duration_ms: HealthCheckTags
	tempo_docs_mcp_jsonrpc_error_count: JsonRpcErrorTags
	tempo_docs_mcp_tool_call_count: ToolTags
	tempo_docs_mcp_tool_duration_ms: ToolTags
	tempo_docs_mcp_ai_search_request_count: AiSearchTags
	tempo_docs_mcp_ai_search_duration_ms: AiSearchTags
	tempo_docs_mcp_ai_search_empty_result_count: AiSearchTags
	tempo_docs_mcp_proxy_fallback_count: ProxyTags
	tempo_docs_mcp_proxy_fallback_duration_ms: ProxyTags
	tempo_docs_mcp_ingest_ok: EmptyTags
	tempo_docs_mcp_ingest_duration_ms: EmptyTags
	tempo_docs_mcp_source_sync_count: SourceTags
	tempo_docs_mcp_source_pages_uploaded: SourceTags
	tempo_docs_mcp_source_pages_failed: SourceTags
	tempo_docs_mcp_source_pages_deleted: SourceTags
}

export type HealthMetricResult = {
	name: string
	ok: boolean
	durationMs: number
	error?: string
}

const KNOWN_METHODS = new Set([
	'initialize',
	'notifications/initialized',
	'ping',
	'tools/list',
	'tools/call',
	'resources/list',
	'resources/read',
	'resources/templates/list',
])

const KNOWN_TOOLS = new Set(['search', 'find_pages', 'read_page', 'code'])

export const workerMetrics = createMetrics<DocsMcpMetricRegistry>({
	globalTags: {
		component: 'docs_mcp',
		repository: 'tempo-apps',
		service: 'tempo-docs-mcp',
	},
})

export function flushWorkerMetrics(): void {
	workerMetrics.flush()
}

export function recordHttpRequestMetrics(args: {
	durationMs: number
	method: string
	route: string
	status: number
	thrown?: boolean
}): void {
	const tags = {
		method: args.method,
		route: args.route,
		status_class: statusClass(args.status),
	}
	workerMetrics.count('tempo_docs_mcp_http_request_count', 1, tags)
	workerMetrics.histogram(
		'tempo_docs_mcp_http_response_duration_ms',
		args.durationMs,
		tags,
	)
	if (args.thrown || args.status >= 500) {
		workerMetrics.count('tempo_docs_mcp_http_error_count', 1, {
			...tags,
			error_class: 'server',
		})
	}
}

export function recordHealthMetrics(args: {
	checks: HealthMetricResult[]
	durationMs: number
}): void {
	const endpoint = 'public'
	const ok = args.checks.every((check) => check.ok)
	workerMetrics.gauge('tempo_docs_mcp_health_ok', ok ? 1 : 0, { endpoint })
	workerMetrics.histogram(
		'tempo_docs_mcp_health_duration_ms',
		args.durationMs,
		{
			endpoint,
		},
	)
	for (const check of args.checks) {
		const tags = { check: check.name, endpoint }
		workerMetrics.gauge(
			'tempo_docs_mcp_health_check_ok',
			check.ok ? 1 : 0,
			tags,
		)
		workerMetrics.histogram(
			'tempo_docs_mcp_health_check_duration_ms',
			check.durationMs,
			tags,
		)
	}
}

export function recordJsonRpcError(
	method: unknown,
	errorCode: number | string,
	toolName?: unknown,
): void {
	workerMetrics.count('tempo_docs_mcp_jsonrpc_error_count', 1, {
		error_code: String(errorCode),
		mcp_method: metricMcpMethod(method),
		tool_name: metricToolName(toolName),
	})
}

export function recordToolCall(
	toolName: unknown,
	outcome: string,
	durationMs: number,
): void {
	const tags = {
		outcome,
		tool_name: metricToolName(toolName),
	}
	workerMetrics.count('tempo_docs_mcp_tool_call_count', 1, tags)
	workerMetrics.histogram('tempo_docs_mcp_tool_duration_ms', durationMs, tags)
}

export function recordAiSearchRequest(args: {
	chunks: number
	durationMs: number
	path: string
	sourceCount: number
}): void {
	const tags = {
		path: args.path,
		source_filter: sourceFilterTag(args.sourceCount),
	}
	workerMetrics.count('tempo_docs_mcp_ai_search_request_count', 1, tags)
	workerMetrics.histogram(
		'tempo_docs_mcp_ai_search_duration_ms',
		args.durationMs,
		tags,
	)
	if (args.chunks === 0) {
		workerMetrics.count('tempo_docs_mcp_ai_search_empty_result_count', 1, tags)
	}
}

export function recordProxyFallback(status: number, durationMs: number): void {
	const tags = { status_class: statusClass(status) }
	workerMetrics.count('tempo_docs_mcp_proxy_fallback_count', 1, tags)
	workerMetrics.histogram(
		'tempo_docs_mcp_proxy_fallback_duration_ms',
		durationMs,
		tags,
	)
}

export function recordIngestMetrics(args: {
	durationMs: number
	force: boolean
	reports: SyncReport[]
}): void {
	const ok = args.reports.every((report) => report.status !== 'error')
	workerMetrics.gauge('tempo_docs_mcp_ingest_ok', ok ? 1 : 0, {})
	workerMetrics.histogram(
		'tempo_docs_mcp_ingest_duration_ms',
		args.durationMs,
		{},
	)
	for (const report of args.reports) {
		const tags = {
			force: String(args.force),
			source: report.source,
			status: report.status,
		}
		workerMetrics.count('tempo_docs_mcp_source_sync_count', 1, tags)
		if (report.status === 'synced') {
			workerMetrics.count(
				'tempo_docs_mcp_source_pages_uploaded',
				report.pages,
				tags,
			)
			workerMetrics.count(
				'tempo_docs_mcp_source_pages_failed',
				report.failed,
				tags,
			)
			workerMetrics.count(
				'tempo_docs_mcp_source_pages_deleted',
				report.deleted,
				tags,
			)
		}
		if (report.status === 'error') {
			workerMetrics.count('tempo_docs_mcp_source_pages_failed', 1, tags)
		}
	}
}

function metricMcpMethod(method: unknown): string {
	if (typeof method !== 'string' || method.trim() === '') return 'none'
	return KNOWN_METHODS.has(method) ? method : 'other'
}

function metricToolName(name: unknown): string {
	if (typeof name !== 'string' || name.trim() === '') return 'none'
	return KNOWN_TOOLS.has(name) ? name : 'unknown'
}

function sourceFilterTag(count: number): string {
	if (count <= 0) return 'none'
	if (count === 1) return 'single'
	return 'multi'
}

function statusClass(status: number): string {
	if (status >= 500) return '5xx'
	if (status >= 400) return '4xx'
	if (status >= 300) return '3xx'
	if (status >= 200) return '2xx'
	return 'other'
}
