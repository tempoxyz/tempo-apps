import { codeMcpServer } from '@cloudflare/codemode/mcp'
import type { Executor } from '@cloudflare/codemode'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
	CallToolRequestSchema,
	type CallToolResult,
	ListToolsRequestSchema,
	type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { toMarkdownUrl } from './llms-txt.js'
import {
	recordAiSearchRequest,
	recordJsonRpcError,
	recordToolCall,
} from './metrics.js'
import type { Source } from './sources.js'

type JsonRpcRequest = {
	jsonrpc?: string
	id?: string | number | null
	method?: string
	params?: {
		name?: string
		arguments?: ToolArguments
	}
}

type ToolArguments = SearchArguments & ReadPageArguments & FindPagesArguments

type SearchArguments = {
	query?: unknown
	source?: unknown
	sources?: unknown
	max_results?: unknown
	max_chars_per_chunk?: unknown
	max_total_chars?: unknown
	include_raw?: unknown
	response_format?: unknown
	ai_search_options?: LegacySearchOptions
}

type ReadPageArguments = {
	source?: unknown
	path?: unknown
	url?: unknown
	query?: unknown
	max_chars?: unknown
	response_format?: unknown
}

type FindPagesArguments = {
	source?: unknown
	query?: unknown
	max_results?: unknown
	response_format?: unknown
}

type SourceIndexEntry = {
	title: string
	url: string
	description?: string
}

type LegacySearchOptions = {
	max_num_results?: unknown
	ranking_options?: {
		score_threshold?: unknown
	}
	reranking?: AiSearchOptions['reranking']
	filters?: VectorizeVectorMetadataFilter
	retrieval?: AiSearchOptions['retrieval']
	query_rewrite?: AiSearchOptions['query_rewrite']
	cache?: AiSearchOptions['cache']
}

type McpContext = {
	instance: AiSearchInstance
	sources?: Source[]
	executor?: Executor
}

const CODE_TOOL_NAME = 'code'
const CODEMODE_TOOL_NAMES = new Set(['search', 'find_pages', 'read_page'])
const DEFAULT_MAX_RESULTS = 5
const DEFAULT_MATCH_THRESHOLD = 0.45
const DEFAULT_MAX_CHARS_PER_CHUNK = 1200
const DEFAULT_MAX_TOTAL_CHARS = 2400
const FILTER_FALLBACK_TTL_MS = 10 * 60_000
const SEARCH_RESULT_CACHE_TTL_MS = 60_000
const SEARCH_RESULT_CACHE_MAX_ENTRIES = 128
const PAGE_CACHE_TTL_MS = 60_000
const PAGE_CACHE_MAX_ENTRIES = 128
const SOURCE_INDEX_CACHE_TTL_MS = 10 * 60_000
const SOURCE_INDEX_CACHE_MAX_ENTRIES = 64
const DEFAULT_MAX_PAGE_CHARS = 12_000
const RESOURCE_INDEX_MAX_ENTRIES = 50
const SOURCES_RESOURCE_URI = 'tempo-docs://sources'

type SearchResultChunk = AiSearchSearchResponse['chunks'][number]
const sourceFilterFallbackUntil = new Map<string, number>()
const searchResultCache = new Map<
	string,
	{ expiresAt: number; result: AiSearchSearchResponse }
>()
const searchInFlight = new Map<string, Promise<AiSearchSearchResponse>>()
const pageCache = new Map<string, { expiresAt: number; text: string }>()
const pageInFlight = new Map<string, Promise<string>>()
const sourceIndexCache = new Map<
	string,
	{ expiresAt: number; entries: SourceIndexEntry[] }
>()
const sourceIndexInFlight = new Map<string, Promise<SourceIndexEntry[]>>()

const NOISE_LINE_PATTERNS = [
	/^skip to content$/i,
	/^\[skip to content\]\(/i,
	/^search\.\.\.$/i,
	/^\[\]\(\/\)$/i,
	/^⌘$/i,
	/^k$/i,
	/^i$/i,
	/^was this helpful\?$/i,
	/^copy page for ai$/i,
	/^ask ai\.\.\.$/i,
	/^suggest changes to this page$/i,
]

const SOURCE_QUERY_HINTS: Record<
	string,
	{ pattern: RegExp; weight: number }[]
> = {
	mpp: [
		{ pattern: /\bmpp\b/, weight: 5 },
		{ pattern: /\bmachine payments?\b/, weight: 4 },
		{ pattern: /\bpayment protocol\b/, weight: 4 },
		{ pattern: /\bjson rpc\b/, weight: 2 },
		{ pattern: /\bx402\b/, weight: 2 },
	],
	regen: [
		{ pattern: /\bregen\b/, weight: 5 },
		{ pattern: /\bbutton\b/, weight: 3 },
		{ pattern: /\bvariants?\b/, weight: 2 },
		{ pattern: /\bcomponents?\b/, weight: 2 },
	],
	tempo: [
		{ pattern: /\bvirtual addresses?\b/, weight: 5 },
		{ pattern: /\btip 20\b/, weight: 4 },
		{ pattern: /\bdeposits?\b/, weight: 2 },
	],
	viem: [
		{ pattern: /\bviem\b/, weight: 5 },
		{ pattern: /\bwallet client\b/, weight: 3 },
		{ pattern: /\bpublic client\b/, weight: 3 },
		{ pattern: /\btypescript\b/, weight: 2 },
		{ pattern: /\bfee token\b/, weight: 2 },
	],
	vocs: [
		{ pattern: /\bvocs\b/, weight: 5 },
		{ pattern: /\bmcp server\b/, weight: 4 },
		{ pattern: /\bdocs site\b/, weight: 3 },
		{ pattern: /\bdocumentation framework\b/, weight: 3 },
	],
	wagmi: [
		{ pattern: /\bwagmi\b/, weight: 5 },
		{ pattern: /\btempowallet\b/, weight: 4 },
		{ pattern: /\bconnector\b/, weight: 3 },
		{ pattern: /\breact hooks?\b/, weight: 3 },
	],
}

export async function handleMcp(
	req: Request,
	context: McpContext,
): Promise<Response | undefined> {
	if (req.method !== 'POST') return undefined

	let body: JsonRpcRequest
	try {
		body = (await req.clone().json()) as JsonRpcRequest
	} catch {
		return undefined
	}

	if (body.method === 'tools/list') {
		const tools = toolSchemas(context.sources ?? [])
		const executor = context.executor
		if (!executor) return jsonRpc(req, body.id, { tools })
		const codeTools = await listCodeTools(tools, { ...context, executor })
		return jsonRpc(req, body.id, { tools: [...tools, ...codeTools] })
	}

	if (body.method === 'resources/list') {
		return jsonRpc(req, body.id, {
			resources: resourcesFor(context.sources ?? []),
		})
	}

	if (body.method === 'resources/templates/list') {
		return jsonRpc(req, body.id, {
			resourceTemplates: resourceTemplatesFor(context.sources ?? []),
		})
	}

	if (body.method === 'resources/read') {
		const uri = (body.params as { uri?: unknown } | undefined)?.uri
		if (typeof uri !== 'string') {
			return jsonRpcErrorFor(req, body, -32602, 'uri must be a string')
		}
		const contents = await readResource(uri, context.sources ?? [])
		if (!contents) {
			return jsonRpcErrorFor(req, body, -32002, `resource not found: ${uri}`)
		}
		return jsonRpc(req, body.id, { contents })
	}

	if (body.method !== 'tools/call') {
		return undefined
	}
	if (body.params?.name === CODE_TOOL_NAME) {
		return trackToolCall(CODE_TOOL_NAME, async () => {
			const executor = context.executor
			if (!executor) {
				return jsonRpcErrorFor(req, body, -32601, 'code tool is not available')
			}
			const codeServer = await createCodeServer(
				toolSchemas(context.sources ?? []),
				{ ...context, executor },
			)
			const result = await callServerTool(codeServer, {
				name: CODE_TOOL_NAME,
				arguments: body.params?.arguments as
					| Record<string, unknown>
					| undefined,
			})
			return jsonRpc(req, body.id, result)
		})
	}
	if (body.params?.name === 'read_page') {
		return trackToolCall('read_page', () =>
			handleReadPage(req, body, context.sources ?? []),
		)
	}
	if (body.params?.name === 'find_pages') {
		return trackToolCall('find_pages', () =>
			handleFindPages(req, body, context.sources ?? []),
		)
	}
	if (body.params?.name !== 'search') return undefined
	const args = body.params.arguments

	return trackToolCall('search', async () => {
		const query = args?.query
		if (typeof query !== 'string' || query.trim().length === 0) {
			return jsonRpcErrorFor(
				req,
				body,
				-32602,
				'query must be a non-empty string',
			)
		}

		const sourceError = validateSources(args, context.sources ?? [])
		if (sourceError) return jsonRpcErrorFor(req, body, -32602, sourceError)

		try {
			const effectiveArgs = argsWithInferredSource(
				query.trim(),
				args,
				context.sources ?? [],
			)
			const result = await cachedSearch(
				query.trim(),
				effectiveArgs,
				context.instance,
				context.sources ?? [],
			)
			const formatted = formatResult(
				result,
				effectiveArgs,
				context.sources ?? [],
			)

			return toolResult(
				req,
				body.id,
				effectiveArgs,
				formatted,
				'search complete',
			)
		} catch (err) {
			return toolErrorResponse(req, body.id, err)
		}
	})
}

async function createCodeServer(
	tools: Tool[],
	context: McpContext & { executor: Executor },
): Promise<McpServer> {
	return codeMcpServer({
		server: createReadOnlyDocsServer(tools, context),
		executor: context.executor,
		description: `Execute JavaScript to perform multi-step Tempo docs lookups.

Available read-only docs tools:
{{types}}

Write an async arrow function in JavaScript that returns the result.
Do not use TypeScript syntax, type annotations, interfaces, or generics.
Do not define a named function and then call it.

{{example}}`,
	})
}

function createReadOnlyDocsServer(
	tools: Tool[],
	context: McpContext,
): McpServer {
	const docsTools = tools.filter((tool) => CODEMODE_TOOL_NAMES.has(tool.name))
	const server = new McpServer(
		{
			name: 'tempo-docs-readonly',
			version: '1.0.0',
		},
		{ capabilities: { tools: {} } },
	)
	server.server.setRequestHandler(ListToolsRequestSchema, () => ({
		tools: docsTools,
	}))
	server.server.setRequestHandler(CallToolRequestSchema, (request) =>
		callLocalDocsTool(context, request.params.name, request.params.arguments),
	)
	return server
}

async function callLocalDocsTool(
	context: McpContext,
	name: string,
	args: Record<string, unknown> | undefined,
): Promise<CallToolResult> {
	if (!CODEMODE_TOOL_NAMES.has(name))
		return toolCallError(`unknown tool: ${name}`)
	const response = await handleMcp(
		new Request('https://mcp.tempo.xyz/', {
			method: 'POST',
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name, arguments: args },
			}),
		}),
		context,
	)
	if (!response) return toolCallError(`unknown tool: ${name}`)
	const payload = (await response.json()) as {
		result?: CallToolResult
		error?: { message?: string }
	}
	if (payload.error)
		return toolCallError(payload.error.message ?? 'tool failed')
	return payload.result ?? toolCallError('tool returned no result')
}

async function listCodeTools(
	tools: Tool[],
	context: McpContext & { executor: Executor },
): Promise<Tool[]> {
	const codeServer = await createCodeServer(tools, context)
	return withMcpClient(codeServer, async (client) => {
		const result = await client.listTools()
		return result.tools
	})
}

async function callServerTool(
	server: McpServer,
	params: { name: string; arguments: Record<string, unknown> | undefined },
): Promise<CallToolResult> {
	return (await withMcpClient(server, (client) =>
		client.callTool(params),
	)) as CallToolResult
}

async function withMcpClient<T>(
	server: McpServer,
	callback: (client: Client) => Promise<T>,
): Promise<T> {
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair()
	const client = new Client({ name: 'tempo-docs-proxy', version: '1.0.0' })
	await server.connect(serverTransport)
	await client.connect(clientTransport)
	try {
		return await callback(client)
	} finally {
		await client.close()
		await server.close()
	}
}

function toolCallError(message: string): CallToolResult {
	return {
		content: [{ type: 'text', text: message }],
		isError: true,
	}
}

async function handleFindPages(
	req: Request,
	body: JsonRpcRequest,
	sources: Source[],
): Promise<Response> {
	const args = body.params?.arguments
	const sourceId = typeof args?.source === 'string' ? args.source.trim() : ''
	const source = sources.find((entry) => entry.id === sourceId)
	if (!source) {
		return jsonRpcErrorFor(req, body, -32602, `unknown source: ${sourceId}`)
	}
	const query = typeof args?.query === 'string' ? args.query.trim() : ''
	if (!query) {
		return jsonRpcErrorFor(
			req,
			body,
			-32602,
			'query must be a non-empty string',
		)
	}

	try {
		const entries = await readSourceIndex(source)
		const tokens = queryTokens(query)
		const pages = entries
			.map((entry) => ({ entry, score: sourceEntryScore(entry, tokens) }))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, findPagesMaxResultsFor(args))
			.map(({ entry, score }) => ({
				title: entry.title,
				url: entry.url,
				score: Number(Math.min(0.99, score / 20).toFixed(4)),
			}))
		return toolResult(
			req,
			body.id,
			args,
			{ source: source.id, query, pages },
			'page candidates found',
		)
	} catch (err) {
		return toolErrorResponse(req, body.id, err)
	}
}

async function handleReadPage(
	req: Request,
	body: JsonRpcRequest,
	sources: Source[],
): Promise<Response> {
	const args = body.params?.arguments
	const sourceId = typeof args?.source === 'string' ? args.source.trim() : ''
	const source = sources.find((entry) => entry.id === sourceId)
	if (!source) {
		return jsonRpcErrorFor(req, body, -32602, `unknown source: ${sourceId}`)
	}

	const pageUrl = resolvePageUrl(args, source)
	if (!pageUrl) {
		return jsonRpcErrorFor(req, body, -32602, 'path or url must be provided')
	}

	try {
		const text = await readCleanPage(pageUrl)
		const maxChars = maxPageCharsFor(args)
		const truncated = text.length > maxChars
		const resultText = pageTextFor(text, args, maxChars)
		return toolResult(
			req,
			body.id,
			args,
			{
				source: source.id,
				url: pageUrl,
				text: resultText,
				truncated,
			},
			'page read complete',
		)
	} catch (err) {
		return toolErrorResponse(req, body.id, err)
	}
}

function resolvePageUrl(
	args: ReadPageArguments | undefined,
	source: Source,
): string | undefined {
	const raw =
		typeof args?.url === 'string'
			? args.url.trim()
			: typeof args?.path === 'string'
				? args.path.trim()
				: ''
	if (!raw) return undefined

	try {
		const url = new URL(raw, source.base)
		if (url.origin !== new URL(source.base).origin) return undefined
		url.hash = ''
		url.search = ''
		return url.toString()
	} catch {
		return undefined
	}
}

async function readCleanPage(pageUrl: string): Promise<string> {
	const markdownUrl = toMarkdownUrl(pageUrl)
	const cached = pageCache.get(markdownUrl)
	if (cached && cached.expiresAt > Date.now()) return cached.text
	if (cached) pageCache.delete(markdownUrl)

	const inFlight = pageInFlight.get(markdownUrl)
	if (inFlight) return inFlight

	const pending = fetchCleanPage(markdownUrl)
	pageInFlight.set(markdownUrl, pending)
	try {
		return await pending
	} finally {
		pageInFlight.delete(markdownUrl)
	}
}

async function fetchCleanPage(markdownUrl: string): Promise<string> {
	const res = await fetch(markdownUrl, { cf: { cacheTtl: 60 } })
	if (!res.ok) throw new Error(`page fetch ${res.status}`)
	const text = normalizeMarkdown(await res.text())
	if (!text) throw new Error('page is empty')
	cachePage(markdownUrl, text)
	return text
}

function cachePage(key: string, text: string): void {
	pageCache.set(key, { expiresAt: Date.now() + PAGE_CACHE_TTL_MS, text })
	if (pageCache.size <= PAGE_CACHE_MAX_ENTRIES) return
	const oldestKey = pageCache.keys().next().value
	if (oldestKey) pageCache.delete(oldestKey)
}

async function cachedSearch(
	query: string,
	args: SearchArguments | undefined,
	instance: AiSearchInstance,
	sources: Source[],
): Promise<AiSearchSearchResponse> {
	const key = searchCacheKey(query, args)
	const cached = searchResultCache.get(key)
	if (cached && cached.expiresAt > Date.now()) return cached.result
	if (cached) searchResultCache.delete(key)

	const inFlight = searchInFlight.get(key)
	if (inFlight) return inFlight

	const pending = runAndCacheSearch(key, query, args, instance, sources)
	searchInFlight.set(key, pending)
	try {
		return await pending
	} finally {
		searchInFlight.delete(key)
	}
}

async function runAndCacheSearch(
	key: string,
	query: string,
	args: SearchArguments | undefined,
	instance: AiSearchInstance,
	sources: Source[],
): Promise<AiSearchSearchResponse> {
	const result = await runSearch(query, args, instance, sources)
	cacheSearchResult(key, result)
	const postFallbackKey = searchCacheKey(query, args)
	if (postFallbackKey !== key) cacheSearchResult(postFallbackKey, result)
	return result
}

async function runSearch(
	query: string,
	args: SearchArguments | undefined,
	instance: AiSearchInstance,
	sources: Source[],
): Promise<AiSearchSearchResponse> {
	const wantedSources = selectedSources(args)
	const skipSourceFilter = shouldSkipSourceFilter(wantedSources)
	let result = await searchWithMetrics(
		instance,
		{
			query,
			ai_search_options: normalizeOptions(args, {
				includeSourceFilter: !skipSourceFilter,
				maxResults: upstreamMaxResultsFor(args),
				...(skipSourceFilter
					? { maxResults: fallbackMaxResultsFor(args) }
					: {}),
			}),
		},
		{ path: 'primary', sourceCount: wantedSources.length },
	)
	if (skipSourceFilter) {
		result = filterSourceChunks(
			result,
			wantedSources,
			upstreamMaxResultsFor(args),
		)
	} else if (result.chunks.length === 0 && wantedSources.length > 0) {
		rememberStaleSourceFilters(wantedSources)
		const fallback = await searchWithMetrics(
			instance,
			{
				query,
				ai_search_options: normalizeOptions(args, {
					includeSourceFilter: false,
					maxResults: fallbackMaxResultsFor(args),
				}),
			},
			{ path: 'unfiltered_fallback', sourceCount: wantedSources.length },
		)
		const filtered = filterSourceChunks(
			fallback,
			wantedSources,
			upstreamMaxResultsFor(args),
		)
		if (filtered.chunks.length > 0) result = filtered
	}
	if (result.chunks.length === 0) {
		result = await localSourceSearch(
			query,
			args,
			wantedSources,
			sources,
			result,
		)
	}
	return result
}

async function searchWithMetrics(
	instance: AiSearchInstance,
	request: AiSearchSearchRequest,
	tags: { path: string; sourceCount: number },
): Promise<AiSearchSearchResponse> {
	const startedAt = performance.now()
	const result = await instance.search(request)
	recordAiSearchRequest({
		chunks: result.chunks.length,
		durationMs: Math.round(performance.now() - startedAt),
		path: tags.path,
		sourceCount: tags.sourceCount,
	})
	return result
}

function searchCacheKey(
	query: string,
	args: SearchArguments | undefined,
): string {
	const wantedSources = selectedSources(args)
	const skipSourceFilter = shouldSkipSourceFilter(wantedSources)
	return stableStringify({
		query,
		sources: wantedSources,
		options: normalizeOptions(args, {
			includeSourceFilter: !skipSourceFilter,
			maxResults: upstreamMaxResultsFor(args),
			...(skipSourceFilter ? { maxResults: fallbackMaxResultsFor(args) } : {}),
		}),
	})
}

function cacheSearchResult(key: string, result: AiSearchSearchResponse): void {
	searchResultCache.set(key, {
		expiresAt: Date.now() + SEARCH_RESULT_CACHE_TTL_MS,
		result,
	})
	if (searchResultCache.size <= SEARCH_RESULT_CACHE_MAX_ENTRIES) return
	const oldestKey = searchResultCache.keys().next().value
	if (oldestKey) searchResultCache.delete(oldestKey)
}

function shouldSkipSourceFilter(sources: string[]): boolean {
	if (sources.length === 0) return false
	const now = Date.now()
	return sources.every(
		(source) => (sourceFilterFallbackUntil.get(source) ?? 0) > now,
	)
}

function rememberStaleSourceFilters(sources: string[]): void {
	const until = Date.now() + FILTER_FALLBACK_TTL_MS
	for (const source of sources) sourceFilterFallbackUntil.set(source, until)
}

function filterSourceChunks(
	result: AiSearchSearchResponse,
	sources: string[],
	maxResults: number,
): AiSearchSearchResponse {
	if (sources.length === 0) return result
	return {
		...result,
		chunks: result.chunks
			.filter((chunk) => {
				const source = sourceForChunk(chunk)
				return source ? sources.includes(source) : false
			})
			.slice(0, maxResults),
	}
}

async function localSourceSearch(
	query: string,
	args: SearchArguments | undefined,
	sourceIds: string[],
	sources: Source[],
	emptyResult: AiSearchSearchResponse,
): Promise<AiSearchSearchResponse> {
	if (sourceIds.length !== 1) return emptyResult
	if (args?.include_raw === true) return emptyResult

	const source = sources.find((entry) => entry.id === sourceIds[0])
	if (!source) return emptyResult

	const entries = await readSourceIndex(source)
	const tokens = queryTokens(query)
	const scored = entries
		.map((entry) => ({ entry, score: sourceEntryScore(entry, tokens) }))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, localSourceMaxResultsFor(args))

	const chunks = (
		await Promise.allSettled(
			scored.map(async ({ entry, score }) =>
				sourceIndexChunk(source, entry, await readCleanPage(entry.url), score),
			),
		)
	)
		.filter(
			(result): result is PromiseFulfilledResult<SearchResultChunk> =>
				result.status === 'fulfilled',
		)
		.map((result) => result.value)
	if (chunks.length === 0) return emptyResult
	return { ...emptyResult, chunks }
}

async function readSourceIndex(source: Source): Promise<SourceIndexEntry[]> {
	const key = `${source.id}:${source.indexPath ?? '/llms.txt'}`
	const cached = sourceIndexCache.get(key)
	if (cached && cached.expiresAt > Date.now()) return cached.entries
	if (cached) sourceIndexCache.delete(key)

	const inFlight = sourceIndexInFlight.get(key)
	if (inFlight) return inFlight

	const pending = fetchSourceIndex(source)
	sourceIndexInFlight.set(key, pending)
	try {
		return await pending
	} finally {
		sourceIndexInFlight.delete(key)
	}
}

async function fetchSourceIndex(source: Source): Promise<SourceIndexEntry[]> {
	const res = await fetch(
		new URL(source.indexPath ?? '/llms.txt', source.base).toString(),
		{
			cf: { cacheTtl: 60 },
		},
	)
	if (!res.ok) return []
	const entries = parseSourceIndex(await res.text(), source.base)
	cacheSourceIndex(`${source.id}:${source.indexPath ?? '/llms.txt'}`, entries)
	return entries
}

function cacheSourceIndex(key: string, entries: SourceIndexEntry[]): void {
	sourceIndexCache.set(key, {
		expiresAt: Date.now() + SOURCE_INDEX_CACHE_TTL_MS,
		entries,
	})
	if (sourceIndexCache.size <= SOURCE_INDEX_CACHE_MAX_ENTRIES) return
	const oldestKey = sourceIndexCache.keys().next().value
	if (oldestKey) sourceIndexCache.delete(oldestKey)
}

function parseSourceIndex(body: string, base: string): SourceIndexEntry[] {
	const origin = new URL(base).origin
	const entries = []
	for (const line of body.split('\n')) {
		const match =
			line.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?/) ??
			plainPathSourceIndexMatch(line)
		if (!match) continue
		const [, title, rawUrl, description] = match
		try {
			const url = new URL(rawUrl, origin)
			if (url.origin !== origin) continue
			url.hash = ''
			url.search = ''
			entries.push({
				title: title.trim(),
				url: publicDocsUrl(url.toString()),
				...(description?.trim() ? { description: description.trim() } : {}),
			})
		} catch {
			// Ignore invalid index entries.
		}
	}
	return entries
}

function plainPathSourceIndexMatch(
	line: string,
): [string, string, string, string | undefined] | undefined {
	const match = line.match(/^\s*[-*]\s+((?:\/|\.\/)[^:\s]+)(?::\s*(.*))?/)
	if (!match) return undefined
	const [, rawUrl, description] = match
	return [match[0], titleFromPath(rawUrl), rawUrl, description]
}

function titleFromPath(path: string): string {
	const last = path
		.split('/')
		.filter(Boolean)
		.at(-1)
		?.replace(/\.md$/i, '')
		.replace(/[-_]+/g, ' ')
		.trim()
	if (!last) return path
	return last.charAt(0).toUpperCase() + last.slice(1)
}

function sourceEntryScore(entry: SourceIndexEntry, tokens: string[]): number {
	if (tokens.length === 0) return 0
	const haystack = `${entry.title} ${entry.description ?? ''} ${entry.url}`
		.toLowerCase()
		.replace(/[-_/]+/g, ' ')
	let score = 0
	for (const token of tokens) {
		if (!haystack.includes(token)) continue
		score += entry.title.toLowerCase().includes(token) ? 3 : 1
	}
	return score
}

function sourceIndexChunk(
	source: Source,
	entry: SourceIndexEntry,
	text: string,
	score: number,
): SearchResultChunk {
	return {
		id: `${source.id}:${entry.url}`,
		type: 'text',
		score: Math.min(0.9, 0.4 + score / 20),
		text,
		item: {
			key: keyForSourceUrl(source, entry.url),
			metadata: {
				source: source.id,
				url: entry.url,
				...(source.description
					? { source_description: source.description }
					: {}),
			},
		},
	}
}

function keyForSourceUrl(source: Source, url: string): string {
	const path = new URL(toMarkdownUrl(url)).pathname.replace(/^\/+|\/+$/g, '')
	return `${source.id}/${path.replace(/\//g, '_')}`
}

function normalizeOptions(
	args: SearchArguments | undefined,
	options: { includeSourceFilter?: boolean; maxResults?: number } = {},
): AiSearchOptions {
	const input = args?.ai_search_options
	const {
		max_num_results: legacyMaxResults,
		ranking_options: rankingOptions,
		filters,
		retrieval = {},
		...rest
	} = input ?? {}
	const maxResults = options.maxResults ?? maxResultsFor(args)
	const threshold = numberInRange(rankingOptions?.score_threshold, 0, 1)
	const sourceFilter =
		options.includeSourceFilter === false ? undefined : sourceFilterFor(args)

	return {
		...rest,
		retrieval: {
			...retrieval,
			retrieval_type: retrieval.retrieval_type ?? 'hybrid',
			keyword_match_mode: retrieval.keyword_match_mode ?? 'or',
			max_num_results:
				retrieval.max_num_results ?? maxResults ?? DEFAULT_MAX_RESULTS,
			match_threshold:
				retrieval.match_threshold ?? threshold ?? DEFAULT_MATCH_THRESHOLD,
			context_expansion: retrieval.context_expansion ?? 0,
			...(filters || sourceFilter
				? { filters: { ...filters, ...sourceFilter } }
				: {}),
		},
		reranking: {
			enabled: true,
			...input?.reranking,
		},
		cache: {
			enabled: true,
			cache_threshold: 'close_enough',
			...input?.cache,
		},
	}
}

function formatResult(
	result: AiSearchSearchResponse,
	args: SearchArguments | undefined,
	sources: Source[],
): AiSearchSearchResponse | { search_query: string; chunks: unknown[] } {
	if (args?.include_raw === true) {
		return {
			...result,
			chunks: result.chunks.map((chunk) => ({
				...chunk,
				text: cleanChunkText(chunk.text),
			})),
		}
	}

	return {
		search_query: result.search_query,
		chunks: compactChunks(
			distinctPageChunks(result.chunks, sources).slice(0, maxResultsFor(args)),
			args,
			sources,
		),
	}
}

function compactChunks(
	chunks: SearchResultChunk[],
	args: SearchArguments | undefined,
	sources: Source[],
) {
	const maxTotalChars = maxTotalCharsFor(args)
	const maxChunks = Math.max(
		1,
		Math.min(chunks.length, Math.floor(maxTotalChars / 300)),
	)
	const selected = chunks.slice(0, maxChunks)
	const maxChars = Math.min(
		maxCharsPerChunkFor(args),
		Math.floor(maxTotalChars / selected.length),
	)
	return selected.map((chunk) => compactChunk(chunk, args, sources, maxChars))
}

function distinctPageChunks(
	chunks: SearchResultChunk[],
	sources: Source[],
): SearchResultChunk[] {
	const seen = new Set<string>()
	const distinct = []
	for (const chunk of chunks) {
		const key = pageIdentityForChunk(chunk, sources)
		if (seen.has(key)) continue
		seen.add(key)
		distinct.push(chunk)
	}
	return distinct
}

function pageIdentityForChunk(
	chunk: SearchResultChunk,
	sources: Source[],
): string {
	const url = urlForChunk(chunk, sources)
	if (!url) return chunk.item.key
	try {
		const parsed = new URL(url)
		parsed.hash = ''
		parsed.search = ''
		return parsed.toString().replace(/\/$/, '')
	} catch {
		return url
	}
}

function compactChunk(
	chunk: SearchResultChunk,
	args: SearchArguments | undefined,
	sources: Source[],
	maxChars = maxCharsPerChunkFor(args),
) {
	const source = sourceForChunk(chunk)
	const url = urlForChunk(chunk, sources)
	const text = compactText(chunk.text, args, maxChars)

	return {
		score: Number(chunk.score.toFixed(4)),
		...(source ? { source } : {}),
		...(url ? { url } : { key: chunk.item.key }),
		text,
	}
}

function urlForChunk(
	chunk: SearchResultChunk,
	sources: Source[],
): string | undefined {
	const metadata = chunk.item.metadata ?? {}
	if (typeof metadata.url === 'string') return publicDocsUrl(metadata.url)
	return urlFromKey(chunk.item.key, sources)
}

function urlFromKey(key: string, sources: Source[]): string | undefined {
	const slash = key.indexOf('/')
	if (slash === -1 || key.startsWith('http')) return undefined
	const sourceId = key.slice(0, slash)
	const source = sources.find((entry) => entry.id === sourceId)
	if (!source) return undefined

	const path = key
		.slice(slash + 1)
		.replace(/\.md$/i, '')
		.replace(/_/g, '/')
	if (!path) return source.base
	try {
		return publicDocsUrl(new URL(`/${path}`, source.base).toString())
	} catch {
		return undefined
	}
}

function publicDocsUrl(url: string): string {
	try {
		const parsed = new URL(url)
		if (parsed.pathname.endsWith('.md')) {
			parsed.pathname = parsed.pathname.slice(0, -'.md'.length)
		}
		parsed.hash = ''
		parsed.search = ''
		return parsed.toString().replace(/\/$/, '')
	} catch {
		return url
	}
}

function compactText(
	text: string,
	args: SearchArguments | undefined,
	maxChars = maxCharsPerChunkFor(args),
): string {
	const cleaned = cleanChunkText(text)
	if (cleaned.length <= maxChars) return cleaned
	return excerptText(cleaned, queryFor(args), maxChars)
}

function maxCharsPerChunkFor(args: SearchArguments | undefined): number {
	return (
		numberInRange(args?.max_chars_per_chunk, 300, 12_000) ??
		DEFAULT_MAX_CHARS_PER_CHUNK
	)
}

function maxTotalCharsFor(args: SearchArguments | undefined): number {
	return (
		numberInRange(args?.max_total_chars, 300, 50_000) ??
		Math.max(maxResultsFor(args) * 300, DEFAULT_MAX_TOTAL_CHARS)
	)
}

function queryFor(args: SearchArguments | undefined): string {
	return typeof args?.query === 'string' ? args.query : ''
}

function excerptText(text: string, query: string, maxChars: number): string {
	const index = bestMatchIndex(text, query) ?? 0
	const halfWindow = Math.floor(maxChars / 2)
	let start = Math.max(0, index - halfWindow)
	let end = Math.min(text.length, start + maxChars)
	start = Math.max(0, end - maxChars)
	end = Math.min(text.length, start + maxChars)

	const excerpt = text.slice(start, end).trim()
	const prefix = start > 0 ? '... ' : ''
	const suffix = end < text.length ? ' ...' : ''
	return `${prefix}${excerpt}${suffix}`
}

function bestMatchIndex(text: string, query: string): number | undefined {
	const lowerText = text.toLowerCase()
	for (const token of queryTokens(query)) {
		const index = lowerText.indexOf(token)
		if (index !== -1) return index
	}
	return undefined
}

function queryTokens(query: string): string[] {
	const stopwords = new Set([
		'about',
		'available',
		'configure',
		'does',
		'have',
		'into',
		'over',
		'tempo',
		'that',
		'this',
		'using',
		'what',
		'when',
		'with',
		'work',
		'works',
	])
	return [
		...new Set(
			query
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter((token) => token.length >= 4 && !stopwords.has(token)),
		),
	].sort((a, b) => b.length - a.length)
}

function maxResultsFor(args: SearchArguments | undefined): number {
	const input = args?.ai_search_options
	return (
		numberInRange(input?.retrieval?.max_num_results, 1, 50) ??
		numberInRange(args?.max_results, 1, 50) ??
		numberInRange(input?.max_num_results, 1, 50) ??
		DEFAULT_MAX_RESULTS
	)
}

function upstreamMaxResultsFor(args: SearchArguments | undefined): number {
	return maxResultsFor(args)
}

function fallbackMaxResultsFor(args: SearchArguments | undefined): number {
	return Math.max(upstreamMaxResultsFor(args), 20)
}

function localSourceMaxResultsFor(args: SearchArguments | undefined): number {
	return Math.min(maxResultsFor(args), 3)
}

function findPagesMaxResultsFor(args: FindPagesArguments | undefined): number {
	return (
		numberInRange(args?.max_results, 1, 25) ?? Math.min(DEFAULT_MAX_RESULTS, 5)
	)
}

function cleanChunkText(text: string): string {
	return normalizeMarkdown(text)
}

function normalizeMarkdown(text: string): string {
	return stripSitemapComment(text)
		.split('\n')
		.map((line) => line.trimEnd())
		.filter(
			(line) => !NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line)),
		)
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

function stripSitemapComment(content: string): string {
	return content
		.replace(/\r\n/g, '\n')
		.replace(/^<!--\nSitemap:\n[\s\S]*?\n-->\n*/, '')
}

function maxPageCharsFor(args: ReadPageArguments | undefined): number {
	return numberInRange(args?.max_chars, 300, 50_000) ?? DEFAULT_MAX_PAGE_CHARS
}

function sourceFilterFor(
	args: SearchArguments | undefined,
): VectorizeVectorMetadataFilter | undefined {
	const sources = selectedSources(args)
	if (sources.length === 0) return undefined
	if (sources.length === 1) return { source: sources[0] }
	return { source: { $in: sources } }
}

function selectedSources(args: SearchArguments | undefined): string[] {
	const sources = [
		typeof args?.source === 'string' ? args.source : undefined,
		...(Array.isArray(args?.sources) ? args.sources : []),
	]
		.filter((source): source is string => typeof source === 'string')
		.map((source) => source.trim())
		.filter(Boolean)
	return [...new Set(sources)]
}

function argsWithInferredSource(
	query: string,
	args: SearchArguments | undefined,
	sources: Source[],
): SearchArguments | undefined {
	if (selectedSources(args).length > 0) return args

	const inferred = inferSourceForQuery(query, sources)
	if (!inferred) return args
	return { ...args, sources: [inferred] }
}

function inferSourceForQuery(
	query: string,
	sources: Source[],
): string | undefined {
	const knownSources = new Set(sources.map((source) => source.id))
	if (knownSources.size === 0) return undefined

	const normalized = query.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
	const scores = [...knownSources]
		.map((source) => ({
			source,
			score: (SOURCE_QUERY_HINTS[source] ?? []).reduce(
				(total, hint) =>
					total + (hint.pattern.test(normalized) ? hint.weight : 0),
				0,
			),
		}))
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score)

	const [best, second] = scores
	if (!best || best.score < 4) return undefined
	if (second && second.score >= best.score) return undefined
	return best.source
}

function validateSources(
	args: SearchArguments | undefined,
	sources: Source[],
): string | undefined {
	const known = new Set(sources.map((source) => source.id))
	if (known.size === 0) return undefined

	const unknown = selectedSources(args).filter((source) => !known.has(source))
	if (unknown.length === 0) return undefined
	return `unknown source: ${unknown.join(', ')}`
}

function sourceFromKey(chunk: SearchResultChunk): string | undefined {
	const prefix = chunk.item.key.split('/')[0]
	if (!prefix || prefix.startsWith('https:')) return undefined
	return prefix
}

function sourceForChunk(chunk: SearchResultChunk): string | undefined {
	const metadata = chunk.item.metadata ?? {}
	return typeof metadata.source === 'string'
		? metadata.source
		: sourceFromKey(chunk)
}

function numberInRange(
	value: unknown,
	min: number,
	max: number,
): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
	return Math.min(max, Math.max(min, value))
}

function stableStringify(value: unknown): string {
	return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortJson)
	if (!value || typeof value !== 'object') return value
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.filter(([, entry]) => entry !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, entry]) => [key, sortJson(entry)]),
	)
}

function jsonRpc(
	req: Request,
	id: JsonRpcRequest['id'],
	result: unknown,
): Response {
	const payload = JSON.stringify({ result, jsonrpc: '2.0', id: id ?? null })
	return mcpResponse(req, payload)
}

function toolResult(
	req: Request,
	id: JsonRpcRequest['id'],
	args: { response_format?: unknown } | undefined,
	result: unknown,
	textSummary: string,
): Response {
	if (args?.response_format === 'structured') {
		return jsonRpc(req, id, {
			content: [{ type: 'text', text: textSummary }],
			structuredContent: { success: true, result },
		})
	}
	return jsonRpc(req, id, {
		content: [
			{
				type: 'text',
				text: JSON.stringify({ success: true, result }),
			},
		],
	})
}

function toolErrorResponse(
	req: Request,
	id: JsonRpcRequest['id'],
	err: unknown,
): Response {
	const message = err instanceof Error ? err.message : String(err)
	return jsonRpc(req, id, {
		content: [
			{
				type: 'text',
				text: JSON.stringify({ success: false, error: message }),
			},
		],
		isError: true,
	})
}

function jsonRpcErrorFor(
	req: Request,
	body: JsonRpcRequest,
	code: number,
	message: string,
): Response {
	return jsonRpcError(req, body.id, code, message, {
		method: body.method,
		toolName: body.params?.name,
	})
}

function jsonRpcError(
	req: Request,
	id: JsonRpcRequest['id'],
	code: number,
	message: string,
	metrics?: { method?: unknown; toolName?: unknown },
): Response {
	recordJsonRpcError(metrics?.method, code, metrics?.toolName)
	const payload = JSON.stringify({
		jsonrpc: '2.0',
		id: id ?? null,
		error: { code, message },
	})
	return mcpResponse(req, payload)
}

function mcpResponse(req: Request, payload: string): Response {
	if (req.headers.get('accept')?.includes('text/event-stream')) {
		return new Response(`event: message\ndata: ${payload}\n\n`, {
			headers: { 'content-type': 'text/event-stream' },
		})
	}
	return new Response(payload, {
		headers: { 'content-type': 'application/json' },
	})
}

async function trackToolCall(
	toolName: string,
	handler: () => Promise<Response>,
): Promise<Response> {
	const startedAt = performance.now()
	try {
		const response = await handler()
		recordToolCall(
			toolName,
			(await responseIsError(response)) ? 'error' : 'success',
			Math.round(performance.now() - startedAt),
		)
		return response
	} catch (error) {
		recordToolCall(toolName, 'error', Math.round(performance.now() - startedAt))
		throw error
	}
}

async function responseIsError(response: Response): Promise<boolean> {
	if (!response.ok) return true
	try {
		const text = await response.clone().text()
		const payload = JSON.parse(sseData(text) ?? text) as {
			error?: unknown
			result?: { isError?: unknown }
		}
		return Boolean(payload.error) || payload.result?.isError === true
	} catch {
		return false
	}
}

function sseData(text: string): string | undefined {
	const line = text.split('\n').find((entry) => entry.startsWith('data: '))
	return line?.slice('data: '.length)
}

function toolSchemas(sources: Source[]): Tool[] {
	const sourceIds = sources.map((source) => source.id)
	return [
		{
			name: 'search',
			description: 'Search Tempo, viem, wagmi, MPP, Vocs, and Regen docs.',
			inputSchema: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Question or task.',
					},
					source: {
						type: 'string',
						description: 'One source.',
						...(sourceIds.length > 0 ? { enum: sourceIds } : {}),
					},
					sources: {
						type: 'array',
						description: 'Source filters.',
						items: {
							type: 'string',
							...(sourceIds.length > 0 ? { enum: sourceIds } : {}),
						},
					},
					max_results: {
						type: 'number',
						description: 'Chunks. Default 5.',
						minimum: 1,
						maximum: 50,
					},
					max_chars_per_chunk: {
						type: 'number',
						description: 'Chars/chunk. Default 1200.',
						minimum: 300,
						maximum: 12000,
					},
					max_total_chars: {
						type: 'number',
						description: 'Total text chars. Default 2400.',
						minimum: 300,
						maximum: 50000,
					},
					include_raw: {
						type: 'boolean',
						description: 'Return raw AI Search chunks.',
					},
					ai_search_options: {
						type: 'object',
						description: 'Advanced AI Search options.',
						additionalProperties: true,
					},
					response_format: {
						type: 'string',
						enum: ['text', 'structured'],
						description: 'structured returns structuredContent.',
					},
				},
				required: ['query'],
			},
			execution: { taskSupport: 'forbidden' },
		},
		{
			name: 'find_pages',
			description: 'Find page URLs from a source index.',
			inputSchema: {
				type: 'object',
				properties: {
					source: {
						type: 'string',
						description: 'Source id.',
						...(sourceIds.length > 0 ? { enum: sourceIds } : {}),
					},
					query: {
						type: 'string',
						description: 'Page topic.',
					},
					max_results: {
						type: 'number',
						description: 'Pages. Default 5.',
						minimum: 1,
						maximum: 25,
					},
					response_format: {
						type: 'string',
						enum: ['text', 'structured'],
						description: 'structured returns structuredContent.',
					},
				},
				required: ['source', 'query'],
			},
			execution: { taskSupport: 'forbidden' },
		},
		{
			name: 'read_page',
			description: 'Read one cleaned docs page.',
			inputSchema: {
				type: 'object',
				properties: {
					source: {
						type: 'string',
						description: 'Source id.',
						...(sourceIds.length > 0 ? { enum: sourceIds } : {}),
					},
					path: {
						type: 'string',
						description: 'Page path.',
					},
					url: {
						type: 'string',
						description: 'Same-origin page URL.',
					},
					max_chars: {
						type: 'number',
						description: 'Chars. Default 12000.',
						minimum: 300,
						maximum: 50000,
					},
					query: {
						type: 'string',
						description: 'Focus excerpt when truncating.',
					},
					response_format: {
						type: 'string',
						enum: ['text', 'structured'],
						description: 'structured returns structuredContent.',
					},
				},
				required: ['source'],
			},
			execution: { taskSupport: 'forbidden' },
		},
	] as Tool[]
}

function pageTextFor(
	text: string,
	args: ReadPageArguments | undefined,
	maxChars: number,
): string {
	if (text.length <= maxChars) return text
	const query = typeof args?.query === 'string' ? args.query.trim() : ''
	if (query) return pageExcerptText(text, query, maxChars)
	return `${text.slice(0, maxChars).trimEnd()} ...`
}

function pageExcerptText(
	text: string,
	query: string,
	maxChars: number,
): string {
	const heading = text
		.split('\n')
		.find((line) => /^#\s+\S/.test(line) || /^##\s+\S/.test(line))
	const excerpt = excerptText(
		text,
		query,
		heading ? Math.max(300, maxChars - heading.length - 2) : maxChars,
	)
	if (!heading || excerpt.includes(heading)) return excerpt
	return `${heading}\n\n${excerpt}`
}

function resourcesFor(sources: Source[]) {
	return [
		{
			uri: SOURCES_RESOURCE_URI,
			name: 'Tempo docs MCP sources',
			description: 'Configured docs sources.',
			mimeType: 'text/markdown',
		},
		...sources.map((source) => ({
			uri: `tempo-docs://source/${source.id}`,
			name: `${source.id} docs source`,
			description: source.description ?? source.base,
			mimeType: 'text/markdown',
		})),
		...sources.map((source) => ({
			uri: `tempo-docs://source/${source.id}/index`,
			name: `${source.id} docs page index`,
			description: `${source.id} page index.`,
			mimeType: 'text/markdown',
		})),
	]
}

function resourceTemplatesFor(sources: Source[]) {
	const sourceNames =
		sources.length > 0
			? sources.map((source) => source.id).join(', ')
			: 'source'
	return [
		{
			uriTemplate: 'tempo-docs://source/{source}',
			name: 'Docs source metadata',
			description: `Source metadata: ${sourceNames}.`,
			mimeType: 'text/markdown',
		},
		{
			uriTemplate: 'tempo-docs://source/{source}/index',
			name: 'Docs source page index',
			description: 'Read one source page index.',
			mimeType: 'text/markdown',
		},
		{
			uriTemplate: 'tempo-docs://source/{source}/page/{path}',
			name: 'Docs source page',
			description: 'Read one cleaned page.',
			mimeType: 'text/markdown',
		},
	]
}

async function readResource(uri: string, sources: Source[]) {
	if (uri === SOURCES_RESOURCE_URI) {
		return [
			{
				uri,
				mimeType: 'text/markdown',
				text: [
					'# Tempo docs MCP sources',
					'Use the `search` tool with `source` to narrow retrieval when the task names a specific library.',
					'Use `source: "tempo"` for core Tempo protocol and integration docs from docs.tempo.xyz.',
					'',
					...sources.map(
						(source) =>
							`- \`${source.id}\`: ${source.description ?? source.base} (${source.base})`,
					),
				].join('\n'),
			},
		]
	}

	const prefix = 'tempo-docs://source/'
	if (!uri.startsWith(prefix)) return undefined
	const rest = uri.slice(prefix.length)
	const [sourceId, ...segments] = rest.split('/')
	const source = sources.find((entry) => entry.id === sourceId)
	if (!source) return undefined
	if (segments[0] === 'index' && segments.length === 1) {
		const entries = await readSourceIndex(source)
		return [
			{
				uri,
				mimeType: 'text/markdown',
				text: sourceIndexResourceText(source, entries),
			},
		]
	}
	if (segments[0] === 'page' && segments.length > 1) {
		const pageUrl = resolvePageUrl(
			{ path: `/${segments.slice(1).join('/')}` },
			source,
		)
		if (!pageUrl) return undefined
		const text = await readCleanPage(pageUrl)
		return [
			{
				uri,
				mimeType: 'text/markdown',
				text:
					text.length > DEFAULT_MAX_PAGE_CHARS
						? `${text.slice(0, DEFAULT_MAX_PAGE_CHARS).trimEnd()} ...`
						: text,
			},
		]
	}
	if (segments.length > 0) return undefined
	return [
		{
			uri,
			mimeType: 'text/markdown',
			text: [
				`# ${source.id} docs source`,
				`Base URL: ${source.base}`,
				`Index path: ${source.indexPath ?? '/llms.txt'}`,
				source.description ? `Description: ${source.description}` : undefined,
				'',
				'Search example:',
				'```json',
				JSON.stringify(
					{
						query: `${source.id} Tempo integration`,
						source: source.id,
						max_results: DEFAULT_MAX_RESULTS,
					},
					null,
					2,
				),
				'```',
			]
				.filter((line): line is string => typeof line === 'string')
				.join('\n'),
		},
	]
}

function sourceIndexResourceText(
	source: Source,
	entries: SourceIndexEntry[],
): string {
	return [
		`# ${source.id} docs page index`,
		entries.length === 0
			? 'No pages found in this source index.'
			: entries
					.slice(0, RESOURCE_INDEX_MAX_ENTRIES)
					.map((entry) => `- [${entry.title}](${entry.url})`)
					.join('\n'),
	]
		.filter(Boolean)
		.join('\n')
}
