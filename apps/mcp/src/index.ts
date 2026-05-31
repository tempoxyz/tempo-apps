import { Hono } from 'hono'
import { cors } from 'hono/cors'

type JsonRpcRequest = {
	jsonrpc: '2.0'
	id?: string | number | null
	method: string
	params?: unknown
}

type JsonRpcSuccess = {
	jsonrpc: '2.0'
	id: string | number | null
	result: unknown
}

type JsonRpcError = {
	jsonrpc: '2.0'
	id: string | number | null
	error: {
		code: number
		message: string
		data?: unknown
	}
}

type McpSource = {
	id: string
	name: string
	url: string
	description: string
}

type SearchResult = {
	source: string
	title: string
	url?: string
	path?: string
	snippet?: string
	content?: string
}

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.use('*', cors())

app.get('/', (context) =>
	context.json({
		name: 'Tempo MCP',
		description:
			'One MCP endpoint for Tempo docs, examples, SDK source, and integration recipes.',
		endpoint: '/mcp',
	}),
)

app.get('/health', (context) => context.text('ok'))

app.post('/mcp', async (context) => {
	const request = (await context.req.json()) as JsonRpcRequest
	const id = request.id ?? null

	try {
		const result = await handleMcpRequest(request, context.env)
		return context.json({ jsonrpc: '2.0', id, result } satisfies JsonRpcSuccess)
	} catch (error) {
		return context.json(
			{
				jsonrpc: '2.0',
				id,
				error: {
					code: -32000,
					message: error instanceof Error ? error.message : 'Unknown error',
				},
			} satisfies JsonRpcError,
			500,
		)
	}
})

async function handleMcpRequest(
	request: JsonRpcRequest,
	env: CloudflareBindings,
): Promise<unknown> {
	switch (request.method) {
		case 'initialize':
			return {
				protocolVersion: '2025-06-18',
				serverInfo: {
					name: 'tempo',
					version: '0.1.0',
				},
				capabilities: {
					tools: {},
				},
			}
		case 'notifications/initialized':
			return {}
		case 'tools/list':
			return { tools: tools() }
		case 'tools/call':
			return callTool(request.params, env)
		default:
			throw new Error(`Unsupported MCP method: ${request.method}`)
	}
}

function tools(): Array<Record<string, unknown>> {
	return [
		{
			name: 'list_sources',
			description:
				'List the docs and SDK MCP sources aggregated by the Tempo MCP server.',
			inputSchema: {
				type: 'object',
				properties: {},
				additionalProperties: false,
			},
		},
		{
			name: 'search',
			description:
				'Search Tempo docs, SDK docs, examples, and source-backed Vocs MCPs from one endpoint.',
			inputSchema: {
				type: 'object',
				properties: {
					query: { type: 'string' },
					scopes: {
						type: 'array',
						items: { type: 'string' },
						description: 'Optional source IDs returned by list_sources.',
					},
					limit: { type: 'number', default: 8 },
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
		{
			name: 'read_page',
			description:
				'Read a known documentation page or source file through the owning MCP source.',
			inputSchema: {
				type: 'object',
				properties: {
					source: { type: 'string' },
					path: { type: 'string' },
				},
				required: ['source', 'path'],
				additionalProperties: false,
			},
		},
		{
			name: 'execute',
			description:
				'Tempo Code Mode: produce a cited integration recipe for a goal using aggregated docs and examples.',
			inputSchema: {
				type: 'object',
				properties: {
					goal: { type: 'string' },
					stack: { type: 'string' },
					constraints: {
						type: 'array',
						items: { type: 'string' },
					},
					validate: { type: 'boolean', default: false },
				},
				required: ['goal'],
				additionalProperties: false,
			},
		},
	]
}

async function callTool(
	params: unknown,
	env: CloudflareBindings,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
	const call = params as { name?: string; arguments?: Record<string, unknown> }
	const sources = configuredSources(env)

	switch (call.name) {
		case 'list_sources':
			return textResult(JSON.stringify(sources, null, 2))
		case 'search':
			return textResult(
				JSON.stringify(await searchAll(sources, call.arguments ?? {}), null, 2),
			)
		case 'read_page':
			return textResult(
				await readPage(sources, call.arguments ?? {}, env.GITHUB_TOKEN),
			)
		case 'execute':
			return textResult(
				JSON.stringify(
					await executeRecipe(sources, call.arguments ?? {}, env.GITHUB_TOKEN),
					null,
					2,
				),
			)
		default:
			throw new Error(`Unsupported tool: ${call.name}`)
	}
}

function configuredSources(env: CloudflareBindings): McpSource[] {
	const configured = JSON.parse(env.TEMPO_MCP_SOURCES || '[]') as McpSource[]
	return configured.filter(
		(source) => source.id && source.name && source.url && source.description,
	)
}

async function searchAll(
	sources: McpSource[],
	args: Record<string, unknown>,
): Promise<SearchResult[]> {
	const query = stringArg(args.query, 'query')
	const scopes = Array.isArray(args.scopes)
		? new Set(
				args.scopes.filter(
					(scope): scope is string => typeof scope === 'string',
				),
			)
		: null
	const limit = typeof args.limit === 'number' ? args.limit : 8
	const selected = scopes
		? sources.filter((source) => scopes.has(source.id))
		: sources

	const settled = await Promise.allSettled(
		selected.map(async (source) => searchSource(source, query, limit)),
	)

	return settled
		.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
		.slice(0, limit)
}

async function searchSource(
	source: McpSource,
	query: string,
	limit: number,
): Promise<SearchResult[]> {
	const searchDocs = await remoteToolCall(source, 'search_docs', {
		query,
		limit,
	}).catch(() => null)
	const results = extractResults(searchDocs, source)
	if (results.length > 0) return results

	const listPages = await remoteToolCall(source, 'list_pages', {}).catch(
		() => null,
	)
	const pages = extractResults(listPages, source)
	const filteredPages = pages
		.filter((page) =>
			`${page.title} ${page.path ?? ''} ${page.snippet ?? ''}`
				.toLowerCase()
				.includes(query.toLowerCase()),
		)
		.slice(0, limit)
	if (filteredPages.length > 0) return filteredPages

	return searchMarkdownIndex(source, query, limit)
}

async function readPage(
	sources: McpSource[],
	args: Record<string, unknown>,
	githubToken: string | undefined,
): Promise<string> {
	const source = findSource(sources, stringArg(args.source, 'source'))
	const path = stringArg(args.path, 'path')
	const result = await remoteToolCall(
		source,
		path.includes('.') ? 'read_source_file' : 'read_page',
		path.includes('.')
			? {
					path,
					repo: source.id === 'tempo-docs' ? 'tempoxyz/tempo-ts' : undefined,
				}
			: { path },
		githubToken,
	)
	const text = JSON.stringify(result, null, 2)
	if (extractResults(result, source).length > 0 || text.length > 50) return text

	return readMarkdownPage(source, path)
}

async function executeRecipe(
	sources: McpSource[],
	args: Record<string, unknown>,
	githubToken: string | undefined,
): Promise<Record<string, unknown>> {
	const goal = stringArg(args.goal, 'goal')
	const stack = typeof args.stack === 'string' ? args.stack : 'react-wagmi'
	const constraints = Array.isArray(args.constraints)
		? args.constraints.filter(
				(item): item is string => typeof item === 'string',
			)
		: []
	const query = [goal, stack, ...constraints].join(' ')
	const citations = await searchAll(sources, { query, limit: 8 })
	const fallbackCitations =
		citations.length > 0 ? citations : await fallbackSearch(sources, query)

	return {
		goal,
		stack,
		recipe: [
			'Use the canonical Tempo SDK, Accounts, Wagmi, and Viem APIs before writing custom signing, transport, or transaction encoding code.',
			'Start from the cited docs/examples, then import the package helper that owns the behavior.',
			'For React wallet UX, prefer the Tempo Wagmi connector path and pass provider options through the connector, e.g. MPP enablement belongs in the provider config instead of a local wrapper.',
			'For server or Worker flows, use Viem transports and Tempo SDK helpers, then validate with TypeScript before shipping.',
		].join('\n'),
		citations: fallbackCitations.slice(0, 8),
		validation: args.validate
			? {
					notes: [
						'Remote sandbox validation is not enabled in this Worker yet.',
						'Use the cited package examples as fixtures for local typecheck/test validation.',
					],
				}
			: undefined,
		githubTokenConfigured: Boolean(githubToken),
	}
}

async function fallbackSearch(
	sources: McpSource[],
	query: string,
): Promise<SearchResult[]> {
	const settled = await Promise.allSettled(
		sources.map((source) => searchMarkdownIndex(source, query, 4)),
	)
	return settled.flatMap((result) =>
		result.status === 'fulfilled' ? result.value : [],
	)
}

async function remoteToolCall(
	source: McpSource,
	name: string,
	args: Record<string, unknown>,
	bearerToken?: string,
): Promise<unknown> {
	const headers = new Headers({
		'Content-Type': 'application/json',
		Accept: 'application/json, text/event-stream',
	})
	if (bearerToken) headers.set('Authorization', `Bearer ${bearerToken}`)

	const response = await fetch(source.url, {
		method: 'POST',
		headers,
		signal: AbortSignal.timeout(4_000),
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: `${source.id}-${name}`,
			method: 'tools/call',
			params: { name, arguments: args },
		}),
	})

	if (!response.ok)
		throw new Error(`${source.id} ${name} failed: ${response.status}`)

	const body = await response.text()
	return parseMcpResponse(body)
}

async function searchMarkdownIndex(
	source: McpSource,
	query: string,
	limit: number,
): Promise<SearchResult[]> {
	const origin = new URL(source.url).origin
	const index = await fetchText(`${origin}/llms.txt`)
	const haystack = index
	const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean)

	if (!haystack) return []

	const sections = haystack
		.split(/\n(?=#{1,3}\s)/g)
		.map((section) => section.trim())
		.filter(Boolean)

	return sections
		.map((section) => {
			const lower = section.toLowerCase()
			const score = queryTerms.reduce(
				(total, term) => total + (lower.includes(term) ? 1 : 0),
				0,
			)
			const title = section.match(/^#{1,3}\s+(.+)$/m)?.[1] ?? source.name
			const url = section.match(/https?:\/\/[^\s)]+/)?.[0]
			return { section, score, title, url }
		})
		.filter((match) => match.score > 0)
		.sort((left, right) => right.score - left.score)
		.slice(0, limit)
		.map((match) => ({
			source: source.id,
			title: match.title,
			url: match.url,
			snippet: match.section.slice(0, 1_000),
		}))
}

async function readMarkdownPage(
	source: McpSource,
	path: string,
): Promise<string> {
	const origin = new URL(source.url).origin
	const normalizedPath = path.startsWith('/') ? path : `/${path}`
	const markdownPath = normalizedPath.endsWith('.md')
		? normalizedPath
		: `${normalizedPath}.md`
	const text = await fetchText(`${origin}${markdownPath}`)
	if (!text) throw new Error(`Unable to read ${source.id}:${path}`)
	return text
}

async function fetchText(url: string): Promise<string | null> {
	const response = await fetch(url, {
		headers: {
			Accept: 'text/markdown, text/plain',
		},
		signal: AbortSignal.timeout(4_000),
	})
	if (!response.ok) return null
	return response.text()
}

function parseMcpResponse(body: string): unknown {
	const trimmed = body.trim()
	if (trimmed.startsWith('event:') || trimmed.startsWith('data:')) {
		const data = trimmed
			.split('\n')
			.find((line) => line.startsWith('data: '))
			?.slice('data: '.length)
		return data ? JSON.parse(data) : trimmed
	}
	return JSON.parse(trimmed)
}

function extractResults(result: unknown, source: McpSource): SearchResult[] {
	const content = (result as { result?: { content?: unknown[] } }).result
		?.content
	if (!Array.isArray(content)) return []

	return content.flatMap((item) => {
		const text = (item as { text?: unknown }).text
		if (typeof text !== 'string') return []

		try {
			const parsed = JSON.parse(text) as unknown
			const rows = Array.isArray(parsed) ? parsed : [parsed]
			return rows.map((row) => normalizeResult(row, source))
		} catch {
			return [
				{
					source: source.id,
					title: source.name,
					snippet: text.slice(0, 1_000),
				},
			]
		}
	})
}

function normalizeResult(row: unknown, source: McpSource): SearchResult {
	const record = row as Record<string, unknown>
	return {
		source: source.id,
		title:
			stringValue(record.title) ??
			stringValue(record.name) ??
			stringValue(record.path) ??
			source.name,
		url: stringValue(record.url),
		path: stringValue(record.path),
		snippet:
			stringValue(record.snippet) ??
			stringValue(record.description) ??
			stringValue(record.content),
	}
}

function findSource(sources: McpSource[], sourceId: string): McpSource {
	const source = sources.find((candidate) => candidate.id === sourceId)
	if (!source) throw new Error(`Unknown source: ${sourceId}`)
	return source
}

function stringArg(value: unknown, name: string): string {
	if (typeof value !== 'string' || value.length === 0)
		throw new Error(`Missing required string argument: ${name}`)
	return value
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}

function textResult(text: string): {
	content: Array<{ type: 'text'; text: string }>
} {
	return { content: [{ type: 'text', text }] }
}

export default app satisfies ExportedHandler<CloudflareBindings>
