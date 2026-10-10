import { codeMcpServer } from '@cloudflare/codemode/mcp'
import type { Executor } from '@cloudflare/codemode'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
	CallToolRequestSchema,
	type CallToolResult,
	LATEST_PROTOCOL_VERSION,
	ListToolsRequestSchema,
	SUPPORTED_PROTOCOL_VERSIONS,
	type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { toMarkdownUrl } from './llms-txt.js'
import { log } from './log.js'
import {
	isHtmlDocument,
	MARKDOWN_ACCEPT,
	normalizeDocsMarkdown,
} from './markdown.js'
import {
	recordAiSearchRequest,
	recordJsonRpcError,
	recordToolCall,
} from './metrics.js'
import type { Source } from './sources.js'
import { resolveSourcePageUrl, sourceIndexUrl } from './sources.js'

type JsonRpcRequest = {
	jsonrpc?: string
	id?: string | number | null
	method?: string
	params?: {
		name?: string
		arguments?: ToolArguments
		uri?: unknown
		protocolVersion?: unknown
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
	/** Docs navigation section from the index headings, e.g. `Accounts`. */
	section?: string
}

/**
 * Retrieval options accepted from older clients that saw the raw AI Search
 * tool schema. Only bounded fields are honored; see `normalizeOptions`.
 */
type LegacySearchOptions = {
	max_num_results?: unknown
	ranking_options?: {
		score_threshold?: unknown
	}
	filters?: VectorizeVectorMetadataFilter
	retrieval?: {
		retrieval_type?: unknown
		keyword_match_mode?: unknown
		max_num_results?: unknown
		match_threshold?: unknown
		context_expansion?: unknown
	}
	cache?: { enabled?: unknown }
}

type McpContext = {
	instance: AiSearchInstance
	sources?: Source[]
	executor?: Executor
}

const CODE_TOOL_NAME = 'code'
const CODEMODE_TOOL_NAMES = new Set(['search', 'find_pages', 'read_page'])
const MAX_QUERY_LENGTH = 4096
const MAX_QUERY_TOKENS = 128
const DEFAULT_MAX_RESULTS = 5
/**
 * Retrieval and rerank floors. Measured against production with labeled
 * queries: 0.3/0.2 removed empty result sets without changing top-1 hits,
 * while the previous 0.45 floor discarded relevant chunks.
 */
const DEFAULT_MATCH_THRESHOLD = 0.3
const DEFAULT_RERANK_THRESHOLD = 0.2
const DEFAULT_MAX_CHARS_PER_CHUNK = 1200
const DEFAULT_MAX_TOTAL_CHARS = 2400
const FILTER_FALLBACK_TTL_MS = 10 * 60_000
const SEARCH_RESULT_CACHE_TTL_MS = 60_000
const SEARCH_RESULT_CACHE_MAX_ENTRIES = 128
const PAGE_CACHE_TTL_MS = 60_000
const PAGE_CACHE_MAX_ENTRIES = 128
const SOURCE_INDEX_CACHE_TTL_MS = 10 * 60_000
const SOURCE_INDEX_CACHE_MAX_ENTRIES = 64
const SECTION_LOOKUP_TIMEOUT_MS = 500
const DEFAULT_MAX_PAGE_CHARS = 12_000
const RESOURCE_INDEX_MAX_ENTRIES = 500
const MAX_BATCH_MESSAGES = 20
const BATCH_CONCURRENCY = 4
const SOURCES_RESOURCE_URI = 'tempo-docs://sources'
const SERVER_INFO = {
	name: 'tempo-docs',
	title: 'Tempo Docs',
	version: '1.0.0',
} as const
const CORS_HEADERS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'POST, OPTIONS',
	// `*` covers any request header except Authorization, which must be named.
	'access-control-allow-headers': '*, Authorization',
	'access-control-max-age': '86400',
} as const
const READ_ONLY_TOOL_ANNOTATIONS = {
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: true,
	readOnlyHint: true,
} as const

type SearchResultChunk = AiSearchSearchResponse['chunks'][number]
/**
 * Search response annotated with how its chunks were retrieved:
 * `source_index` means AI Search returned nothing and chunks came from
 * title matching against the source's `llms.txt` index.
 */
type SearchResult = AiSearchSearchResponse & {
	retrieval?: 'ai_search' | 'source_index'
}

/** Tool input problems whose message is safe and useful to show the caller. */
class ToolInputError extends Error {}
const sourceFilterFallbackUntil = new Map<string, number>()
const searchResultCache = new Map<
	string,
	{ expiresAt: number; result: SearchResult }
>()
const searchInFlight = new Map<string, Promise<SearchResult>>()
const pageCache = new Map<string, { expiresAt: number; text: string }>()
const pageInFlight = new Map<string, Promise<string>>()
const sourceIndexCache = new Map<
	string,
	{ expiresAt: number; entries: SourceIndexEntry[] }
>()
const sourceIndexInFlight = new Map<string, Promise<SourceIndexEntry[]>>()

/**
 * Hints for choosing a source when a search names none. A source's own name is
 * an explicit signal. Topical phrases only route queries that do not mention
 * Tempo, so Tempo questions about MCP or machine payments still reach the
 * Tempo docs.
 */
const SOURCE_QUERY_HINTS: Record<
	string,
	{ pattern: RegExp; weight: number; explicit?: boolean }[]
> = {
	mpp: [
		{ pattern: /\bmpp\b/, weight: 5, explicit: true },
		{ pattern: /\bmachine payments?\b/, weight: 4 },
		{ pattern: /\bpayment protocol\b/, weight: 4 },
		{ pattern: /\bjson rpc\b/, weight: 2 },
		{ pattern: /\bx402\b/, weight: 2 },
	],
	regen: [
		{ pattern: /\bregen\b/, weight: 5, explicit: true },
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
		{ pattern: /\bviem\b/, weight: 5, explicit: true },
		{ pattern: /\bwallet client\b/, weight: 3 },
		{ pattern: /\bpublic client\b/, weight: 3 },
		{ pattern: /\btypescript\b/, weight: 2 },
		{ pattern: /\bfee token\b/, weight: 2 },
	],
	vocs: [
		{ pattern: /\bvocs\b/, weight: 5, explicit: true },
		{ pattern: /\bdocs site\b/, weight: 3 },
		{ pattern: /\bdocumentation framework\b/, weight: 3 },
	],
	wagmi: [
		{ pattern: /\bwagmi\b/, weight: 5, explicit: true },
		{ pattern: /\btempowallet\b/, weight: 4 },
		{ pattern: /\bconnector\b/, weight: 3 },
		{ pattern: /\breact hooks?\b/, weight: 3 },
	],
}

/**
 * Serve the Tempo docs MCP endpoint: a stateless streamable-HTTP server that
 * answers every JSON-RPC message locally.
 */
export async function handleMcp(
	req: Request,
	context: McpContext,
): Promise<Response> {
	if (req.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: CORS_HEADERS })
	}
	if (req.method !== 'POST') {
		return httpError(
			405,
			-32000,
			'Method not allowed. Send MCP JSON-RPC messages with POST.',
			{
				allow: 'POST, OPTIONS',
			},
		)
	}

	let body: unknown
	try {
		body = await req.clone().json()
	} catch {
		return httpError(400, -32700, 'Parse error: invalid JSON')
	}

	// Clients send the negotiated version after `initialize`; an initialize
	// request may carry any version and is answered with a supported one.
	const protocolVersion = req.headers.get('mcp-protocol-version')
	if (
		protocolVersion &&
		!SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion) &&
		!(isRecord(body) && body.method === 'initialize')
	) {
		return httpError(
			400,
			-32600,
			`Unsupported MCP-Protocol-Version: ${protocolVersion}`,
		)
	}

	if (Array.isArray(body)) return handleBatch(req, body, context)
	return handleMessage(req, body, context)
}

/** Answer one parsed JSON-RPC message. */
async function handleMessage(
	req: Request,
	message: unknown,
	context: McpContext,
): Promise<Response> {
	if (isJsonRpcResponse(message)) {
		return new Response(null, { status: 202, headers: CORS_HEADERS })
	}
	if (!isJsonRpcRequest(message)) {
		return httpError(
			400,
			-32600,
			'Invalid request: expected a JSON-RPC 2.0 message',
		)
	}
	// Notifications carry no id and expect no response.
	if (!('id' in message) || message.id === undefined) {
		return new Response(null, { status: 202, headers: CORS_HEADERS })
	}

	try {
		return await handleRequest(req, message, context)
	} catch (error) {
		log.error('mcp.request_failed', {
			method: message.method,
			error: error instanceof Error ? error.message : String(error),
		})
		return jsonRpcErrorFor(req, message, -32603, 'Internal error')
	}
}

/**
 * Protocol revision 2025-03-26 requires servers to accept JSON-RPC batches;
 * later revisions removed them. Each element is answered as a single message
 * (an array element is an invalid request, never a nested batch), a few at a
 * time, and the responses are returned as one JSON array.
 */
async function handleBatch(
	req: Request,
	messages: unknown[],
	context: McpContext,
): Promise<Response> {
	if (messages.length === 0) {
		return httpError(400, -32600, 'Invalid request: empty batch')
	}
	if (messages.length > MAX_BATCH_MESSAGES) {
		return httpError(
			400,
			-32600,
			`Batch too large: send at most ${MAX_BATCH_MESSAGES} messages`,
		)
	}
	const jsonRequest = new Request(req.url, {
		method: 'POST',
		headers: { accept: 'application/json' },
	})
	const replies: unknown[] = []
	for (let index = 0; index < messages.length; index += BATCH_CONCURRENCY) {
		const responses = await Promise.all(
			messages.slice(index, index + BATCH_CONCURRENCY).map(async (message) => {
				const response = await handleMessage(jsonRequest, message, context)
				return response.status === 202 ? undefined : await response.json()
			}),
		)
		for (const response of responses) {
			if (response !== undefined) replies.push(response)
		}
	}
	if (replies.length === 0) {
		return new Response(null, { status: 202, headers: CORS_HEADERS })
	}
	return mcpResponse(req, JSON.stringify(replies))
}

async function handleRequest(
	req: Request,
	body: JsonRpcRequest,
	context: McpContext,
): Promise<Response> {
	const sources = context.sources ?? []
	switch (body.method) {
		case 'initialize':
			return jsonRpc(req, body.id, initializeResult(body, sources))
		case 'ping':
			return jsonRpc(req, body.id, {})
		case 'tools/list': {
			const tools = toolSchemas(sources)
			const executor = context.executor
			if (!executor) return jsonRpc(req, body.id, { tools })
			const codeTools = await listCodeTools(tools, { ...context, executor })
			return jsonRpc(req, body.id, { tools: [...tools, ...codeTools] })
		}
		case 'resources/list':
			return jsonRpc(req, body.id, { resources: resourcesFor(sources) })
		case 'resources/templates/list':
			return jsonRpc(req, body.id, {
				resourceTemplates: resourceTemplatesFor(sources),
			})
		case 'resources/read':
			return handleReadResource(req, body, sources)
		case 'tools/call':
			return handleToolCall(req, body, context)
		default:
			return jsonRpcErrorFor(
				req,
				body,
				-32601,
				`Method not found: ${String(body.method)}`,
			)
	}
}

function initializeResult(body: JsonRpcRequest, sources: Source[]) {
	const requested = body.params?.protocolVersion
	const protocolVersion =
		typeof requested === 'string' &&
		SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
			? requested
			: LATEST_PROTOCOL_VERSION
	return {
		protocolVersion,
		capabilities: { tools: {}, resources: {} },
		serverInfo: SERVER_INFO,
		instructions: serverInstructions(sources),
	}
}

function serverInstructions(sources: Source[]): string {
	const sourceList = sources
		.map(
			(source) =>
				`\`${source.id}\`${source.description ? ` (${source.description})` : ''}`,
		)
		.join('; ')
	return [
		'Read-only search over Tempo and related developer documentation.',
		sourceList ? `Sources: ${sourceList}.` : undefined,
		'Use `search` for questions; pass `source` when the task names a product or library.',
		'Use `find_pages` to locate a page in one source index, then `read_page` with the returned `source` and `url`.',
		'Results include the docs navigation `section` when the source index groups its pages.',
		'Use `code` to combine several lookups in one call.',
		'The index can lag the live sites; if a result looks outdated, read the page with `read_page`.',
	]
		.filter(Boolean)
		.join(' ')
}

async function handleReadResource(
	req: Request,
	body: JsonRpcRequest,
	sources: Source[],
): Promise<Response> {
	const uri = body.params?.uri
	if (typeof uri !== 'string') {
		return jsonRpcErrorFor(req, body, -32602, 'uri must be a string')
	}
	let contents: Awaited<ReturnType<typeof readResource>>
	try {
		contents = await readResource(uri, sources)
	} catch (error) {
		if (error instanceof PageUnavailableError) contents = undefined
		else throw error
	}
	if (!contents) {
		return jsonRpcErrorFor(req, body, -32002, `resource not found: ${uri}`)
	}
	return jsonRpc(req, body.id, { contents })
}

async function handleToolCall(
	req: Request,
	body: JsonRpcRequest,
	context: McpContext,
): Promise<Response> {
	const name = body.params?.name
	if (typeof name !== 'string') {
		return jsonRpcErrorFor(req, body, -32602, 'params.name must be a string')
	}
	if (name === CODE_TOOL_NAME && context.executor) {
		const executor = context.executor
		return trackToolCall(CODE_TOOL_NAME, async () => {
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
	if (!CODEMODE_TOOL_NAMES.has(name)) {
		return jsonRpcErrorFor(req, body, -32602, `Unknown tool: ${name}`)
	}

	const query = body.params?.arguments?.query
	if (typeof query === 'string' && query.length > MAX_QUERY_LENGTH) {
		return trackToolCall(name, async () =>
			toolInputError(
				req,
				body.id,
				`query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
			),
		)
	}
	if (name === 'read_page') {
		return trackToolCall('read_page', () =>
			handleReadPage(req, body, context.sources ?? []),
		)
	}
	if (name === 'find_pages') {
		return trackToolCall('find_pages', () =>
			handleFindPages(req, body, context.sources ?? []),
		)
	}
	return trackToolCall('search', () => handleSearch(req, body, context))
}

async function handleSearch(
	req: Request,
	body: JsonRpcRequest,
	context: McpContext,
): Promise<Response> {
	const args = body.params?.arguments
	const sources = context.sources ?? []
	const query = args?.query
	if (typeof query !== 'string' || query.trim().length === 0) {
		return toolInputError(req, body.id, 'query must be a non-empty string')
	}

	const sourceError = validateSources(args, sources)
	if (sourceError) return toolInputError(req, body.id, sourceError)

	try {
		const effectiveArgs = argsWithInferredSource(query.trim(), args, sources)
		const result = await cachedSearch(
			query.trim(),
			effectiveArgs,
			context.instance,
			sources,
		)
		const formatted = formatResult(result, effectiveArgs, sources)
		if (effectiveArgs?.include_raw !== true) {
			await annotateChunkSections(
				(formatted as { chunks: CompactChunk[] }).chunks,
				sources,
			)
		}
		return toolResult(req, body.id, effectiveArgs, formatted, 'search complete')
	} catch (err) {
		return toolErrorResponse(req, body.id, err)
	}
}

/** A client's reply to a server request; this server never sends requests. */
function isJsonRpcResponse(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false
	const message = value as Record<string, unknown>
	return (
		message.jsonrpc === '2.0' &&
		!('method' in message) &&
		('result' in message || 'error' in message)
	)
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
	if (!value || typeof value !== 'object') return false
	const message = value as JsonRpcRequest
	return message.jsonrpc === '2.0' && typeof message.method === 'string'
}

/** A page that could not be read as Markdown from its docs source. */
class PageUnavailableError extends Error {}

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

Each call resolves to { success, result } and throws on invalid input.
Write an async arrow function in JavaScript that returns the result.
Do not use TypeScript syntax, type annotations, interfaces, or generics.
Do not define a named function and then call it.

Example: async () => { const found = await codemode.find_pages({ source: "viem", query: "sendTransaction" }); const page = await codemode.read_page({ source: "viem", url: found.result.pages[0].url, max_chars: 2000 }); return page.result.text; }`,
	})
}

function createReadOnlyDocsServer(
	tools: Tool[],
	context: McpContext,
): McpServer {
	const docsTools = tools
		.filter((tool) => CODEMODE_TOOL_NAMES.has(tool.name))
		.map(codemodeToolSchema)
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

/**
 * Codemode renders array-of-enum schemas as `"a" | "b"[]`, which TypeScript
 * reads as `"a" | ("b"[])`. Describe the allowed values in prose instead; the
 * tool handlers still validate them.
 */
function codemodeToolSchema(tool: Tool): Tool {
	const properties = tool.inputSchema.properties ?? {}
	return {
		...tool,
		inputSchema: {
			...tool.inputSchema,
			properties: Object.fromEntries(
				Object.entries(properties).map(([name, schema]) => {
					const property = schema as {
						type?: string
						description?: string
						items?: { enum?: string[] }
					}
					const values = property.items?.enum
					if (property.type !== 'array' || !values) return [name, schema]
					return [
						name,
						{
							...property,
							description:
								`${property.description ?? ''} One of: ${values.join(', ')}.`.trim(),
							items: { type: 'string' },
						},
					]
				}),
			),
		},
	}
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
	const payload = (await response.json()) as {
		result?: CallToolResult
		error?: { message?: string }
	}
	if (payload.error)
		return toolCallError(payload.error.message ?? 'tool failed')
	if (payload.result?.isError)
		return toolCallError(toolErrorMessage(payload.result))
	return payload.result ?? toolCallError('tool returned no result')
}

async function listCodeTools(
	tools: Tool[],
	context: McpContext & { executor: Executor },
): Promise<Tool[]> {
	const codeServer = await createCodeServer(tools, context)
	return withMcpClient(codeServer, async (client) => {
		const result = await client.listTools()
		return result.tools.map((tool) => ({
			...tool,
			annotations: READ_ONLY_TOOL_ANNOTATIONS,
		}))
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

/** Unwrap the `{ success: false, error }` text of a docs tool error result. */
function toolErrorMessage(result: CallToolResult): string {
	const text = result.content
		.map((item) => (item.type === 'text' ? item.text : ''))
		.join('\n')
	try {
		const parsed = JSON.parse(text) as { error?: unknown }
		if (typeof parsed.error === 'string') return parsed.error
	} catch {
		// Fall through to the raw text.
	}
	return text || 'tool failed'
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
	if (!source)
		return toolInputError(req, body.id, unknownSourceMessage(sourceId, sources))
	const query = typeof args?.query === 'string' ? args.query.trim() : ''
	if (!query) {
		return toolInputError(req, body.id, 'query must be a non-empty string')
	}

	try {
		const entries = await readSourceIndex(source)
		const pages = rankSourceEntries(
			entries,
			query,
			findPagesMaxResultsFor(args),
		).map(({ entry, relevance }) => ({
			title: entry.title,
			url: entry.url,
			...(entry.section ? { section: entry.section } : {}),
			score: Number(relevance.toFixed(4)),
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
	if (!source)
		return toolInputError(req, body.id, unknownSourceMessage(sourceId, sources))

	if (!rawPageReference(args)) {
		return toolInputError(req, body.id, 'path or url must be provided')
	}
	const pageUrl = resolvePageUrl(args, source)
	if (!pageUrl) {
		return toolInputError(
			req,
			body.id,
			`url must be a page under ${source.base}`,
		)
	}

	try {
		const text = await readCleanPage(markdownUrlFor(pageUrl, source))
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

function rawPageReference(args: ReadPageArguments | undefined): string {
	if (typeof args?.url === 'string' && args.url.trim()) return args.url.trim()
	if (typeof args?.path === 'string') return args.path.trim()
	return ''
}

function resolvePageUrl(
	args: ReadPageArguments | undefined,
	source: Source,
): string | undefined {
	const raw = rawPageReference(args)
	if (!raw) return undefined

	return resolveSourcePageUrl(raw, source.base)?.toString()
}

/**
 * Markdown export URL for a page. The root of a source mounted under a path
 * prefix is served at `<prefix>/index.md`, not `<prefix>.md`.
 */
function markdownUrlFor(pageUrl: string, source: Source): string {
	const page = new URL(pageUrl)
	const base = new URL(source.base)
	const prefix = base.pathname.replace(/\/+$/, '')
	if (prefix && page.pathname.replace(/\/+$/, '') === prefix) {
		return `${base.origin}${prefix}/index.md`
	}
	return toMarkdownUrl(pageUrl)
}

function unknownSourceMessage(sourceId: string, sources: Source[]): string {
	const known = sources.map((source) => source.id).join(', ')
	return `unknown source: ${sourceId || '(missing)'}${known ? `. Use one of: ${known}` : ''}`
}

async function readCleanPage(markdownUrl: string): Promise<string> {
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
	const res = await fetch(markdownUrl, {
		headers: { accept: MARKDOWN_ACCEPT },
		cf: { cacheTtl: 60 },
	})
	if (!res.ok) throw new PageUnavailableError(`page fetch ${res.status}`)
	const body = await res.text()
	if (isHtmlDocument(body, res.headers.get('content-type'))) {
		throw new PageUnavailableError('page is HTML, not Markdown')
	}
	const text = normalizeDocsMarkdown(body)
	if (!text) throw new PageUnavailableError('page is empty')
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
): Promise<SearchResult> {
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
): Promise<SearchResult> {
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
): Promise<SearchResult> {
	const wantedSources = selectedSources(args)
	const skipSourceFilter = shouldSkipSourceFilter(wantedSources)
	let result: SearchResult = await searchWithMetrics(
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

function cacheSearchResult(key: string, result: SearchResult): void {
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
): Promise<SearchResult> {
	if (sourceIds.length !== 1) return emptyResult
	if (args?.include_raw === true) return emptyResult

	const source = sources.find((entry) => entry.id === sourceIds[0])
	if (!source) return emptyResult

	const entries = await readSourceIndex(source)
	const ranked = rankSourceEntries(
		entries,
		query,
		localSourceMaxResultsFor(args),
	)

	const chunks = (
		await Promise.allSettled(
			ranked.map(async ({ entry, relevance }) =>
				sourceIndexChunk(
					source,
					entry,
					await readCleanPage(markdownUrlFor(entry.url, source)),
					relevance,
				),
			),
		)
	)
		.filter(
			(result): result is PromiseFulfilledResult<SearchResultChunk> =>
				result.status === 'fulfilled',
		)
		.map((result) => result.value)
	if (chunks.length === 0) return emptyResult
	return { ...emptyResult, chunks, retrieval: 'source_index' }
}

async function readSourceIndex(source: Source): Promise<SourceIndexEntry[]> {
	const key = `${source.id}:${sourceIndexUrl(source)}`
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
	const res = await fetch(sourceIndexUrl(source), {
		headers: { accept: MARKDOWN_ACCEPT },
		cf: { cacheTtl: 60 },
	})
	if (!res.ok) return []
	const entries = parseSourceIndex(await res.text(), source.base)
	cacheSourceIndex(`${source.id}:${sourceIndexUrl(source)}`, entries)
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

/** Wrapper headings that group the whole index rather than one section. */
const CONTENTS_HEADING = /^(?:table of )?contents$/i

function parseSourceIndex(body: string, base: string): SourceIndexEntry[] {
	const entries = []
	let section: string | undefined
	let subsection: string | undefined
	for (const line of body.split('\n')) {
		const heading = line.match(/^(#{2,3})\s+(.+?)\s*$/)
		if (heading) {
			const [, level, label] = heading
			if (level === '##') {
				section = CONTENTS_HEADING.test(label) ? undefined : label
				subsection = undefined
			} else {
				subsection = label
			}
			continue
		}
		const match =
			line.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?/) ??
			plainPathSourceIndexMatch(line) ??
			tipSourceIndexMatch(line)
		if (!match) continue
		const [, title, rawUrl, description] = match
		try {
			const url = resolveSourcePageUrl(rawUrl, base)
			if (!url) continue
			const sectionLabel = [section, subsection].filter(Boolean).join(' / ')
			entries.push({
				title: title.trim(),
				url: publicDocsUrl(url.toString()),
				...(description?.trim() ? { description: description.trim() } : {}),
				...(sectionLabel ? { section: sectionLabel } : {}),
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

/**
 * tips.sh lists proposals as `- **TIP-1000**: Title (Status)`. Suffixed
 * revisions (`TIP-1000-1`) are served only as HTML, so they are skipped.
 */
function tipSourceIndexMatch(
	line: string,
): [string, string, string, undefined] | undefined {
	const match = line.match(/^\s*[-*]\s+\*\*TIP-(\d{4})\*\*:\s*(.+)$/)
	if (!match) return undefined
	const [, number, title] = match
	return [match[0], `TIP-${number}: ${title.trim()}`, `/${number}`, undefined]
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

/**
 * Rank index entries for a query by title, description, and URL matches.
 * Returns relevance in [0, 1); ties prefer shorter, more specific titles.
 */
function rankSourceEntries(
	entries: SourceIndexEntry[],
	query: string,
	limit: number,
): { entry: SourceIndexEntry; relevance: number }[] {
	const tokens = queryTokens(query)
	if (tokens.length === 0) return []
	const phrase = searchableText(query)
	const maxScore = tokens.length * 3 + 8
	return entries
		.map((entry, index) => ({
			entry,
			index,
			score: sourceEntryScore(entry, tokens, phrase),
		}))
		.filter(({ score }) => score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				a.entry.title.length - b.entry.title.length ||
				a.index - b.index,
		)
		.slice(0, limit)
		.map(({ entry, score }) => ({
			entry,
			relevance: Math.min(0.99, score / maxScore),
		}))
}

function sourceEntryScore(
	entry: SourceIndexEntry,
	tokens: string[],
	phrase: string,
): number {
	const title = searchableText(entry.title)
	// The section name is searchable too, so "Payments" finds that section.
	const rest = searchableText(
		`${entry.description ?? ''} ${new URL(entry.url).pathname} ${entry.section ?? ''}`,
	)
	let score = 0
	let titleHits = 0
	for (const token of tokens) {
		if (containsToken(title, token)) {
			score += 3
			titleHits++
		} else if (containsToken(rest, token)) {
			score += 1
		}
	}
	if (score === 0) return 0
	if (phrase && title.includes(phrase)) score += 4
	if (titleHits === tokens.length) score += 2
	// A query that names a docs section ("earn", "zones") prefers its pages.
	const section = searchableText(entry.section ?? '')
	if (section && tokens.some((token) => containsToken(section, token))) {
		score += 2
	}
	return score
}

/** Lowercase words separated and padded by single spaces. */
function searchableText(text: string): string {
	const words = textWords(text)
	return words.length > 0 ? ` ${words.join(' ')} ` : ''
}

/** Lowercase words, splitting camelCase so `useConnect` reads `use connect`. */
function textWords(text: string): string[] {
	return text
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
}

/**
 * Tokens match the start of a word (`address` in `addresses`, `api` in
 * `APIs`, but not `earn` in `learn`); two-character tokens must match a whole
 * word (`20` in `TIP-20`).
 */
function containsToken(text: string, token: string): boolean {
	return token.length >= 3
		? text.includes(` ${token}`)
		: text.includes(` ${token} `)
}

function sourceIndexChunk(
	source: Source,
	entry: SourceIndexEntry,
	text: string,
	relevance: number,
): SearchResultChunk {
	return {
		id: `${source.id}:${entry.url}`,
		type: 'text',
		score: Number(relevance.toFixed(4)),
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

/** Matches the item keys the indexer uploads: `<source>/<path>.md`. */
function keyForSourceUrl(source: Source, url: string): string {
	const path = new URL(toMarkdownUrl(url)).pathname.replace(/^\/+|\/+$/g, '')
	return `${source.id}/${path}`
}

/**
 * Build AI Search options from bounded tool controls. Legacy
 * `ai_search_options` from older clients are honored only for retrieval shape,
 * result counts, thresholds, metadata filters, and disabling the cache.
 * Reranking, query rewriting, and other upstream settings stay server-owned.
 */
function normalizeOptions(
	args: SearchArguments | undefined,
	options: { includeSourceFilter?: boolean; maxResults?: number } = {},
): AiSearchOptions {
	const input = args?.ai_search_options
	const retrieval = input?.retrieval ?? {}
	const maxResults = options.maxResults ?? maxResultsFor(args)
	const threshold =
		numberInRange(retrieval.match_threshold, 0, 1) ??
		numberInRange(input?.ranking_options?.score_threshold, 0, 1) ??
		DEFAULT_MATCH_THRESHOLD
	const filters = isRecord(input?.filters) ? input.filters : undefined
	const sourceFilter =
		options.includeSourceFilter === false ? undefined : sourceFilterFor(args)

	return {
		retrieval: {
			retrieval_type: oneOf(
				retrieval.retrieval_type,
				['vector', 'keyword', 'hybrid'] as const,
				'hybrid',
			),
			keyword_match_mode: oneOf(
				retrieval.keyword_match_mode,
				['and', 'or'] as const,
				'or',
			),
			max_num_results: maxResults,
			match_threshold: threshold,
			context_expansion: Math.round(
				numberInRange(retrieval.context_expansion, 0, 3) ?? 0,
			),
			...(filters || sourceFilter
				? { filters: { ...filters, ...sourceFilter } }
				: {}),
		},
		reranking: {
			enabled: true,
			match_threshold: DEFAULT_RERANK_THRESHOLD,
		},
		// Rewriting turned keyword queries into generic questions and added an
		// extra model call to every search; raw queries ranked better.
		query_rewrite: { enabled: false },
		cache: {
			enabled: input?.cache?.enabled !== false,
			cache_threshold: 'close_enough',
		},
	}
}

function oneOf<const T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): T {
	return allowed.includes(value as T) ? (value as T) : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatResult(
	result: SearchResult,
	args: SearchArguments | undefined,
	sources: Source[],
):
	| SearchResult
	| { search_query: string; retrieval: string; chunks: unknown[] } {
	const retrieval =
		result.chunks.length === 0 ? 'none' : (result.retrieval ?? 'ai_search')
	if (args?.include_raw === true) {
		return {
			...result,
			retrieval,
			chunks: result.chunks.map((chunk) => ({
				...chunk,
				text: normalizeDocsMarkdown(chunk.text),
			})),
		}
	}

	return {
		search_query: result.search_query,
		retrieval,
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

type CompactChunk = {
	score: number
	source?: string
	section?: string
	url?: string
	key?: string
	text: string
}

function compactChunk(
	chunk: SearchResultChunk,
	args: SearchArguments | undefined,
	sources: Source[],
	maxChars = maxCharsPerChunkFor(args),
): CompactChunk {
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

/**
 * Label compact chunks with the configured source that owns their URL and the
 * docs navigation section from that source's index. Crawled pages carry no
 * source metadata, so the URL is the only reliable link to the docs IA.
 */
async function annotateChunkSections(
	chunks: CompactChunk[],
	sources: Source[],
): Promise<void> {
	const owners = new Map<CompactChunk, Source>()
	for (const chunk of chunks) {
		const owner = chunk.url ? sourceForUrl(chunk.url, sources) : undefined
		if (owner) owners.set(chunk, owner)
	}
	const sections = new Map<string, Map<string, string>>()
	await Promise.all(
		[...new Set(owners.values())].map(async (source) => {
			try {
				const entries = await readSourceIndexWithTimeout(source)
				sections.set(
					source.id,
					new Map(
						entries.flatMap((entry) =>
							entry.section ? [[entry.url, entry.section] as const] : [],
						),
					),
				)
			} catch {
				// Sections are optional context; keep the search result.
			}
		}),
	)
	for (const [chunk, source] of owners) {
		chunk.source ??= source.id
		const section = chunk.url
			? sections.get(source.id)?.get(chunk.url)
			: undefined
		if (section) chunk.section = section
	}
}

/** Section labels are optional, so a slow index fetch must not delay search. */
async function readSourceIndexWithTimeout(
	source: Source,
): Promise<SourceIndexEntry[]> {
	let timeout: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			readSourceIndex(source),
			new Promise<SourceIndexEntry[]>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error('section lookup timed out')),
					SECTION_LOOKUP_TIMEOUT_MS,
				)
			}),
		])
	} finally {
		if (timeout) clearTimeout(timeout)
	}
}

/** The configured source whose origin and path prefix contain `url`. */
function sourceForUrl(url: string, sources: Source[]): Source | undefined {
	return sources.find((source) => {
		if (!url.startsWith('https://') && !url.startsWith('http://')) return false
		const resolved = resolveSourcePageUrl(url, source.base)
		return resolved !== undefined && new URL(url).origin === resolved.origin
	})
}

function urlForChunk(
	chunk: SearchResultChunk,
	sources: Source[],
): string | undefined {
	const metadata = chunk.item.metadata ?? {}
	if (typeof metadata.url === 'string') return publicDocsUrl(metadata.url)
	// Pages crawled directly by AI Search use the page URL as their key.
	if (/^https?:\/\//.test(chunk.item.key)) return publicDocsUrl(chunk.item.key)
	return urlFromKey(chunk.item.key, sources)
}

function urlFromKey(key: string, sources: Source[]): string | undefined {
	const slash = key.indexOf('/')
	if (slash === -1 || key.startsWith('http')) return undefined
	const sourceId = key.slice(0, slash)
	const source = sources.find((entry) => entry.id === sourceId)
	if (!source) return undefined

	const keyPath = key.slice(slash + 1).replace(/\.md$/i, '')
	// Keys keep path separators; older single-segment keys used `_` for `/`.
	const path = keyPath.includes('/') ? keyPath : keyPath.replace(/_/g, '/')
	if (!path) return source.base
	try {
		const url = resolveSourcePageUrl(`/${path}`, source.base)
		return url ? publicDocsUrl(url.toString()) : undefined
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
	const cleaned = normalizeDocsMarkdown(text)
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

const QUERY_STOPWORDS = new Set([
	'a',
	'about',
	'an',
	'and',
	'are',
	'available',
	'can',
	'configure',
	'do',
	'does',
	'for',
	'from',
	'get',
	'have',
	'how',
	'i',
	'in',
	'into',
	'is',
	'it',
	'my',
	'of',
	'on',
	'or',
	'over',
	'tempo',
	'that',
	'the',
	'this',
	'to',
	'use',
	'using',
	'what',
	'when',
	'where',
	'which',
	'with',
	'work',
	'works',
])

/**
 * Distinct query words, longest first. Common words are dropped unless the
 * query has nothing else, so `MCP`, `API`, `RPC`, and `T12` still count.
 */
function queryTokens(query: string): string[] {
	const words = textWords(query).filter((word) => word.length >= 2)
	const meaningful = words.filter((word) => !QUERY_STOPWORDS.has(word))
	return [...new Set(meaningful.length > 0 ? meaningful : words)]
		.sort((a, b) => b.length - a.length)
		.slice(0, MAX_QUERY_TOKENS)
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
	const mentionsTempo = /\btempo\b/.test(normalized)
	const scores = [...knownSources]
		.map((source) => {
			const matched = (SOURCE_QUERY_HINTS[source] ?? []).filter((hint) =>
				hint.pattern.test(normalized),
			)
			return {
				source,
				score: matched.reduce((total, hint) => total + hint.weight, 0),
				explicit: matched.some((hint) => hint.explicit),
			}
		})
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score)

	const [best, second] = scores
	if (!best || best.score < 4) return undefined
	if (second && second.score >= best.score) return undefined
	// "machine payments on Tempo" is a Tempo question too; only an explicit
	// library name narrows a Tempo query to another source.
	if (mentionsTempo && best.source !== 'tempo' && !best.explicit) {
		return undefined
	}
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
	// Models sometimes send numeric arguments as strings.
	const number =
		typeof value === 'string' && value.trim() !== '' ? Number(value) : value
	if (typeof number !== 'number' || !Number.isFinite(number)) return undefined
	return Math.min(max, Math.max(min, number))
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
	// Page and input errors help the caller fix the next call; anything else
	// (AI Search or runtime failures) is logged and reported generically.
	const known =
		err instanceof ToolInputError || err instanceof PageUnavailableError
	const message = known
		? (err as Error).message
		: 'Docs tool failed. Try again.'
	if (!known) {
		log.error('mcp.tool_failed', {
			error: err instanceof Error ? err.message : String(err),
		})
	}
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
			headers: { ...CORS_HEADERS, 'content-type': 'text/event-stream' },
		})
	}
	return new Response(payload, {
		headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
	})
}

/** JSON-RPC error for a message that never reached a method handler. */
function httpError(
	status: number,
	code: number,
	message: string,
	headers: Record<string, string> = {},
): Response {
	recordJsonRpcError(undefined, code, undefined)
	return new Response(
		JSON.stringify({ jsonrpc: '2.0', id: null, error: { code, message } }),
		{
			status,
			headers: {
				...CORS_HEADERS,
				...headers,
				'content-type': 'application/json',
			},
		},
	)
}

/**
 * Invalid tool arguments are tool execution errors, not protocol errors, so
 * the model sees the message and can correct its next call.
 */
function toolInputError(
	req: Request,
	id: JsonRpcRequest['id'],
	message: string,
): Response {
	return toolErrorResponse(req, id, new ToolInputError(message))
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
			description:
				sourceIds.length > 0
					? `Search docs: ${sourceIds.join(', ')}.`
					: 'Search docs.',
			annotations: READ_ONLY_TOOL_ANNOTATIONS,
			inputSchema: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						maxLength: MAX_QUERY_LENGTH,
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
			description:
				'Find page URLs from a source index, including docs navigation sections when available.',
			annotations: READ_ONLY_TOOL_ANNOTATIONS,
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
						maxLength: MAX_QUERY_LENGTH,
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
			annotations: READ_ONLY_TOOL_ANNOTATIONS,
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
						maxLength: MAX_QUERY_LENGTH,
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
					'Use `source: "tempo"` for core Tempo protocol and integration docs.',
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
		const text = await readCleanPage(markdownUrlFor(pageUrl, source))
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
	let sections: string[] = []
	try {
		sections = [
			...new Set(
				(await readSourceIndex(source)).flatMap((entry) =>
					entry.section ? [entry.section] : [],
				),
			),
		]
	} catch {
		// Sections are optional context.
	}
	return [
		{
			uri,
			mimeType: 'text/markdown',
			text: [
				`# ${source.id} docs source`,
				`Base URL: ${source.base}`,
				`Index path: ${source.indexPath ?? '/llms.txt'}`,
				source.description ? `Description: ${source.description}` : undefined,
				sections.length > 0 ? `Sections: ${sections.join(', ')}` : undefined,
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
	const shown = entries.slice(0, RESOURCE_INDEX_MAX_ENTRIES)
	const lines: string[] = []
	let section: string | undefined
	for (const entry of shown) {
		if (entry.section !== section) {
			lines.push('', `## ${entry.section ?? 'Other pages'}`)
			section = entry.section
		}
		lines.push(`- [${entry.title}](${entry.url})`)
	}
	return [
		`# ${source.id} docs page index`,
		entries.length === 0
			? 'No pages found in this source index.'
			: lines.join('\n').trim(),
		entries.length > shown.length
			? `Showing ${shown.length} of ${entries.length} pages. Use \`find_pages\` with \`source: "${source.id}"\` to locate the rest.`
			: undefined,
	]
		.filter(Boolean)
		.join('\n')
}
