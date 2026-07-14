import { recordHealthMetrics, type HealthMetricResult } from './metrics.js'

type JsonObject = Record<string, unknown>
type CheckFn = () => Promise<void>

const DEFAULT_ENDPOINT = 'https://mcp.tempo.xyz/'
const HEALTH_FETCH_TIMEOUT_MS = 5000
const REQUIRED_TOOLS = ['search', 'find_pages', 'read_page']

export async function healthMetrics(env: {
	PUBLIC_MCP_ENDPOINT?: string
}): Promise<void> {
	const startedAt = performance.now()
	const endpoint = env.PUBLIC_MCP_ENDPOINT || DEFAULT_ENDPOINT
	const checks = await runChecks(endpoint)
	recordHealthMetrics({
		checks,
		durationMs: Math.round(performance.now() - startedAt),
	})

	const failures = checks.filter((check) => !check.ok)
	if (failures.length > 0) {
		console.error(
			JSON.stringify({
				message: 'mcp.health_failed',
				endpoint,
				failures: failures.map((failure) => ({
					check: failure.name,
					error: failure.error,
				})),
			}),
		)
	}
}

async function runChecks(endpoint: string): Promise<HealthMetricResult[]> {
	let tempoPage: JsonObject | undefined
	const checks: Array<[string, CheckFn]> = [
		['initialize', () => assertInitialize(endpoint)],
		['tools_list', () => assertTools(endpoint)],
		['resources_list', () => assertResources(endpoint)],
		['search_tempo', () => assertSearch(endpoint)],
		[
			'find_pages_tempo',
			async () => {
				tempoPage = await firstTempoPage(endpoint)
			},
		],
		['read_page_tempo', () => assertReadPage(endpoint, tempoPage)],
	]
	const results: HealthMetricResult[] = []
	for (const [name, fn] of checks) results.push(await measure(name, fn))
	return results
}

async function measure(name: string, fn: CheckFn): Promise<HealthMetricResult> {
	const startedAt = performance.now()
	try {
		await fn()
		return {
			name,
			ok: true,
			durationMs: Math.round(performance.now() - startedAt),
		}
	} catch (error) {
		return {
			name,
			ok: false,
			durationMs: Math.round(performance.now() - startedAt),
			error: error instanceof Error ? error.message : String(error),
		}
	}
}

async function assertInitialize(endpoint: string): Promise<void> {
	const result = await rpc(endpoint, 'initialize', {
		protocolVersion: '2025-06-18',
		capabilities: {},
		clientInfo: { name: 'tempo-docs-health', version: '1.0.0' },
	})
	if (!stringValue(object(result.serverInfo).name)) {
		throw new Error('initialize missing serverInfo.name')
	}
}

async function assertTools(endpoint: string): Promise<void> {
	const result = await rpc(endpoint, 'tools/list')
	const names = new Set(
		arrayValue(result.tools)
			.map((tool) => object(tool).name)
			.filter((name): name is string => typeof name === 'string'),
	)
	for (const tool of REQUIRED_TOOLS) {
		if (!names.has(tool)) throw new Error(`missing tool ${tool}`)
	}
}

async function assertResources(endpoint: string): Promise<void> {
	const result = await rpc(endpoint, 'resources/list')
	const uris = new Set(
		arrayValue(result.resources)
			.map((resource) => object(resource).uri)
			.filter((uri): uri is string => typeof uri === 'string'),
	)
	if (!uris.has('tempo-docs://sources')) {
		throw new Error('missing sources resource')
	}
}

async function assertSearch(endpoint: string): Promise<void> {
	const result = structuredResult(
		await callTool(endpoint, 'search', {
			query: 'Tempo transactions',
			source: 'tempo',
			max_results: 1,
			response_format: 'structured',
		}),
	)
	if (arrayValue(object(result).chunks).length === 0) {
		throw new Error('search returned no chunks')
	}
}

async function assertReadPage(
	endpoint: string,
	page: JsonObject | undefined,
): Promise<void> {
	if (!page) throw new Error('missing page from find_pages')
	const result = structuredResult(
		await callTool(endpoint, 'read_page', {
			source: 'tempo',
			url: stringValue(page.url),
			max_chars: 500,
			response_format: 'structured',
		}),
	)
	if (stringValue(object(result).text).trim().length === 0) {
		throw new Error('read_page returned empty text')
	}
}

async function firstTempoPage(endpoint: string): Promise<JsonObject> {
	const result = structuredResult(
		await callTool(endpoint, 'find_pages', {
			source: 'tempo',
			query: 'transactions',
			max_results: 1,
			response_format: 'structured',
		}),
	)
	const [page] = arrayValue(object(result).pages)
	if (!page) throw new Error('find_pages returned no pages')
	return object(page)
}

async function callTool(
	endpoint: string,
	name: string,
	args: JsonObject,
): Promise<JsonObject> {
	const result = await rpc(endpoint, 'tools/call', {
		name,
		arguments: args,
	})
	if (result.isError === true) throw new Error(`tool returned isError: ${name}`)
	return result
}

async function rpc(
	endpoint: string,
	method: string,
	params: JsonObject = {},
): Promise<JsonObject> {
	const body = await fetchJsonRpc(endpoint, {
		method: 'POST',
		headers: {
			accept: 'application/json, text/event-stream',
			'content-type': 'application/json',
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
	})
	if (body.error) {
		throw new Error(
			`json-rpc error: ${stringValue(object(body.error).message)}`,
		)
	}
	return object(body.result)
}

async function fetchJsonRpc(
	url: string,
	init: RequestInit,
): Promise<JsonObject> {
	const res = await fetchWithTimeout(url, init)
	if (!res.ok) throw new Error(`HTTP ${res.status}`)
	const text = await res.text()
	const data = sseData(text) ?? text
	return object(JSON.parse(data))
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit,
): Promise<Response> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), HEALTH_FETCH_TIMEOUT_MS)
	try {
		return await fetch(url, { ...init, signal: controller.signal })
	} finally {
		clearTimeout(timeout)
	}
}

function sseData(text: string): string | undefined {
	const line = text.split('\n').find((entry) => entry.startsWith('data: '))
	return line?.slice('data: '.length)
}

function structuredResult(result: JsonObject): unknown {
	return object(object(result.structuredContent).result)
}

function object(value: unknown): JsonObject {
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		return value as JsonObject
	}
	return {}
}

function arrayValue(value: unknown): unknown[] {
	return Array.isArray(value) ? value : []
}

function stringValue(value: unknown): string {
	return typeof value === 'string' ? value : ''
}
