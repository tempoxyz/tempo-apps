import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

export type ToolCase = {
	name: string
	kind: 'tools'
	requiredTools: string[]
	requiredSources: string[]
	maxBytes: number
}

export type ResourceCase = {
	name: string
	kind: 'resource'
	uri: string
	expectedText: string[]
	maxBytes: number
	maxTextChars: number
}

export type SearchCase = {
	name: string
	kind: 'search'
	query: string
	args?: Record<string, unknown>
	expectedSources?: string[]
	expectedUrlIncludes?: string[]
	expectedTextIncludes?: string[]
	maxBytes: number
	maxTextChars: number
	maxDuplicatePages: number
	minChunks: number
	maxChunks: number
}

export type ReadPageCase = {
	name: string
	kind: 'read_page'
	source: string
	path: string
	query?: string
	maxChars?: number
	expectedUrlIncludes: string[]
	expectedTextIncludes: string[]
	maxBytes: number
	maxTextChars: number
}

export type FindPagesCase = {
	name: string
	kind: 'find_pages'
	source: string
	query: string
	responseFormat?: 'structured'
	expectedUrlIncludes: string[]
	expectedTitleIncludes: string[]
	maxBytes: number
	maxPages: number
}

export type EvalCase =
	| ToolCase
	| ResourceCase
	| SearchCase
	| ReadPageCase
	| FindPagesCase

type Chunk = {
	text?: string
	score?: number
	source?: string
	url?: string
	key?: string
	item?: {
		key?: string
		metadata?: Record<string, unknown>
	}
}

export type EvalResult = {
	name: string
	kind: EvalCase['kind']
	passed: boolean
	score: number
	max_score: number
	duration_ms: number
	bytes: number
	text_chars: number
	chunks: number
	duplicate_pages: number
	failures: string[]
}

export type EndpointResult = {
	endpoint: string
	results: EvalResult[]
	summary: {
		score: number
		max_score: number
		passed: number
		total: number
		pass_rate: number
		bytes: number
		text_chars: number
		duplicate_pages: number
		p50_ms: number
		p95_ms: number
	}
}

const noiseTerms = [
	'Skip to content',
	'Was this helpful?',
	'Copy page for AI',
	'Ask AI...',
	'Search...',
]

export const cases: EvalCase[] = [
	{
		name: 'tool_schema',
		kind: 'tools',
		requiredTools: ['search', 'find_pages', 'read_page'],
		requiredSources: ['tempo', 'viem', 'wagmi', 'vocs', 'mpp', 'regen'],
		maxBytes: 2_800,
	},
	{
		name: 'source_resource',
		kind: 'resource',
		uri: 'tempo-docs://sources',
		expectedText: [
			'`tempo`',
			'`viem`',
			'`wagmi`',
			'`vocs`',
			'`mpp`',
			'`regen`',
		],
		maxBytes: 1_000,
		maxTextChars: 800,
	},
	{
		name: 'tempo_index_resource',
		kind: 'resource',
		uri: 'tempo-docs://source/tempo/index',
		expectedText: [
			'# tempo docs page index',
			'Use virtual addresses for deposits',
			'https://docs.tempo.xyz/guide/payments/virtual-addresses',
		],
		maxBytes: 5_200,
		maxTextChars: 4_800,
	},
	{
		name: 'viem_fee_token_filtered',
		kind: 'search',
		query: 'How do I pay Tempo transaction fees in a stablecoin using viem?',
		args: { source: 'viem', max_results: 5 },
		expectedSources: ['viem'],
		expectedUrlIncludes: ['viem.sh/tempo'],
		expectedTextIncludes: ['fee token'],
		maxBytes: 2_600,
		maxTextChars: 1_800,
		maxDuplicatePages: 0,
		minChunks: 1,
		maxChunks: 5,
	},
	{
		name: 'wagmi_wallet_filtered',
		kind: 'search',
		query: 'How do I configure the wagmi tempoWallet connector?',
		args: { source: 'wagmi', max_results: 5 },
		expectedSources: ['wagmi'],
		expectedUrlIncludes: ['wagmi.sh/react/api/connectors/tempoWallet'],
		expectedTextIncludes: ['tempoWallet'],
		maxBytes: 4_000,
		maxTextChars: 2_700,
		maxDuplicatePages: 0,
		minChunks: 1,
		maxChunks: 5,
	},
	{
		name: 'mpp_mcp_transport_filtered',
		kind: 'search',
		query: 'How does MPP payment work over MCP JSON-RPC transport?',
		args: { source: 'mpp', max_results: 5 },
		expectedSources: ['mpp'],
		expectedUrlIncludes: ['mpp.dev/protocol/transports'],
		expectedTextIncludes: ['MCP'],
		maxBytes: 4_000,
		maxTextChars: 2_700,
		maxDuplicatePages: 0,
		minChunks: 1,
		maxChunks: 5,
	},
	{
		name: 'regen_button_filtered',
		kind: 'search',
		query: 'What Regen UI Button variants are available?',
		args: { source: 'regen', max_results: 5 },
		expectedSources: ['regen'],
		expectedUrlIncludes: ['regen.tempo.xyz/button'],
		expectedTextIncludes: ['Button'],
		maxBytes: 4_000,
		maxTextChars: 2_700,
		maxDuplicatePages: 0,
		minChunks: 1,
		maxChunks: 5,
	},
	{
		name: 'vocs_mcp_server_filtered',
		kind: 'search',
		query: 'How do I expose a Vocs docs site as an MCP server?',
		args: { source: 'vocs', max_results: 5 },
		expectedSources: ['vocs'],
		expectedUrlIncludes: ['vocs.dev/features/mcp-server'],
		expectedTextIncludes: ['MCP Server'],
		maxBytes: 4_000,
		maxTextChars: 2_700,
		maxDuplicatePages: 0,
		minChunks: 1,
		maxChunks: 5,
	},
	{
		name: 'tempo_virtual_addresses_filtered',
		kind: 'search',
		query: 'How do virtual addresses work for TIP-20 deposits on Tempo?',
		args: { source: 'tempo', max_results: 5 },
		expectedSources: ['tempo'],
		expectedUrlIncludes: ['docs.tempo.xyz/guide/payments/virtual-addresses'],
		expectedTextIncludes: ['virtual addresses'],
		maxBytes: 4_000,
		maxTextChars: 2_700,
		maxDuplicatePages: 0,
		minChunks: 1,
		maxChunks: 5,
	},
	{
		name: 'tempo_virtual_addresses_inferred',
		kind: 'search',
		query: 'How do virtual addresses work for TIP-20 deposits on Tempo?',
		expectedSources: ['tempo'],
		expectedUrlIncludes: ['docs.tempo.xyz/guide/payments/virtual-addresses'],
		expectedTextIncludes: ['virtual addresses'],
		maxBytes: 4_000,
		maxTextChars: 2_700,
		maxDuplicatePages: 0,
		minChunks: 1,
		maxChunks: 5,
	},
	{
		name: 'find_tempo_virtual_addresses',
		kind: 'find_pages',
		source: 'tempo',
		query: 'virtual addresses deposits',
		expectedUrlIncludes: ['docs.tempo.xyz/guide/payments/virtual-addresses'],
		expectedTitleIncludes: ['Use virtual addresses for deposits'],
		maxBytes: 1_500,
		maxPages: 5,
	},
	{
		name: 'find_tempo_virtual_addresses_structured',
		kind: 'find_pages',
		source: 'tempo',
		query: 'virtual addresses deposits',
		responseFormat: 'structured',
		expectedUrlIncludes: ['docs.tempo.xyz/guide/payments/virtual-addresses'],
		expectedTitleIncludes: ['Use virtual addresses for deposits'],
		maxBytes: 1_500,
		maxPages: 5,
	},
	{
		name: 'read_tempo_virtual_addresses',
		kind: 'read_page',
		source: 'tempo',
		path: '/guide/payments/virtual-addresses',
		query: 'virtual addresses deposits',
		maxChars: 4_000,
		expectedUrlIncludes: ['docs.tempo.xyz/guide/payments/virtual-addresses'],
		expectedTextIncludes: ['# Use virtual addresses for deposits'],
		maxBytes: 5_000,
		maxTextChars: 4_100,
	},
	{
		name: 'read_vocs_mcp_server',
		kind: 'read_page',
		source: 'vocs',
		path: '/features/mcp-server',
		query: 'MCP Server McpSource.github',
		maxChars: 4_000,
		expectedUrlIncludes: ['vocs.dev/features/mcp-server'],
		expectedTextIncludes: ['# MCP Server', 'McpSource.github'],
		maxBytes: 5_000,
		maxTextChars: 4_100,
	},
]

if (isCli()) await main()

async function main(): Promise<void> {
	const endpoint = arg('--endpoint') ?? 'https://mcp.tempo.xyz/'
	const baseline = arg('--baseline')
	const jsonOutput = process.argv.includes('--json')
	const strict = process.argv.includes('--strict')
	const results = baseline
		? {
				baseline: await evalEndpoint(baseline),
				candidate: await evalEndpoint(endpoint),
			}
		: { candidate: await evalEndpoint(endpoint) }

	if (jsonOutput) {
		console.info(JSON.stringify(results, null, 2))
	} else {
		if ('baseline' in results) {
			printEndpoint(results.baseline, 'baseline')
			console.info('')
		}
		printEndpoint(results.candidate, 'candidate')
		if ('baseline' in results)
			printComparison(results.baseline, results.candidate)
	}

	if (
		strict &&
		results.candidate.summary.passed !== results.candidate.summary.total
	) {
		process.exitCode = 1
	}
}

export async function evalEndpoint(endpoint: string): Promise<EndpointResult> {
	const results = []
	for (const testCase of cases) {
		results.push(await runCase(endpoint, testCase))
	}
	const durations = results
		.map((result) => result.duration_ms)
		.sort((a, b) => a - b)
	const score = sum(results.map((result) => result.score))
	const maxScore = sum(results.map((result) => result.max_score))
	const passed = results.filter((result) => result.passed).length
	return {
		endpoint,
		results,
		summary: {
			score,
			max_score: maxScore,
			passed,
			total: results.length,
			pass_rate: maxScore === 0 ? 0 : score / maxScore,
			bytes: sum(results.map((result) => result.bytes)),
			text_chars: sum(results.map((result) => result.text_chars)),
			duplicate_pages: sum(results.map((result) => result.duplicate_pages)),
			p50_ms: percentile(durations, 0.5),
			p95_ms: percentile(durations, 0.95),
		},
	}
}

export async function runCase(
	endpoint: string,
	testCase: EvalCase,
): Promise<EvalResult> {
	if (testCase.kind === 'tools') return runToolsCase(endpoint, testCase)
	if (testCase.kind === 'resource') return runResourceCase(endpoint, testCase)
	if (testCase.kind === 'find_pages')
		return runFindPagesCase(endpoint, testCase)
	if (testCase.kind === 'read_page') return runReadPageCase(endpoint, testCase)
	return runSearchCase(endpoint, testCase)
}

export class TempoDocsMcpProvider {
	id(): string {
		return 'tempo-docs-mcp'
	}

	async callApi(_prompt: string, context?: { vars?: unknown }) {
		const endpoint = process.env.MCP_EVAL_ENDPOINT ?? 'https://mcp.tempo.xyz/'
		const vars = context?.vars as { caseName?: string } | undefined
		const testCase = cases.find((entry) => entry.name === vars?.caseName)
		if (!testCase) {
			return {
				error: `unknown MCP eval case: ${vars?.caseName ?? 'missing'}`,
			}
		}
		const result = await runCase(endpoint, testCase)
		return {
			output: result,
			metadata: {
				endpoint,
				kind: result.kind,
				score: result.score,
				max_score: result.max_score,
				bytes: result.bytes,
				text_chars: result.text_chars,
				chunks: result.chunks,
				duplicate_pages: result.duplicate_pages,
				duration_ms: result.duration_ms,
			},
			tokenUsage: {
				total: result.bytes,
				prompt: 0,
				completion: result.bytes,
			},
		}
	}
}

export const promptfooConfig = {
	description: 'Tempo docs MCP server evals',
	prompts: ['{{caseName}}'],
	providers: ['file://./scripts/eval-mcp.ts'],
	tests: cases.map((testCase) => ({
		description: testCase.name,
		vars: { caseName: testCase.name },
		metadata: { kind: testCase.kind },
		assert: [
			{
				type: 'javascript',
				value: [
					'const result = typeof output === "string" ? JSON.parse(output) : output;',
					'if (result.passed) return true;',
					'return {',
					'  pass: false,',
					'  score: result.max_score ? result.score / result.max_score : 0,',
					'  reason: result.failures.join("; "),',
					'};',
				].join('\n'),
			},
		],
	})),
	evaluateOptions: {
		cache: false,
		maxConcurrency: 1,
		timeoutMs: 30_000,
	},
}

export default TempoDocsMcpProvider

async function runToolsCase(
	endpoint: string,
	testCase: ToolCase,
): Promise<EvalResult> {
	const startedAt = performance.now()
	const failures = []
	try {
		const raw = await mcp(endpoint, {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/list',
		})
		const body = JSON.parse(lastSseData(raw) ?? raw) as {
			result?: { tools?: Array<{ name?: string; inputSchema?: unknown }> }
			error?: { message?: string }
		}
		if (body.error) failures.push(body.error.message ?? 'tools/list error')
		const tools = body.result?.tools ?? []
		const names = tools.map((tool) => tool.name).filter(Boolean)
		for (const tool of testCase.requiredTools) {
			if (!names.includes(tool)) failures.push(`missing tool ${tool}`)
		}
		const search = tools.find((tool) => tool.name === 'search') as
			| { inputSchema?: { properties?: { source?: { enum?: string[] } } } }
			| undefined
		const sourceEnum = search?.inputSchema?.properties?.source?.enum ?? []
		for (const source of testCase.requiredSources) {
			if (!sourceEnum.includes(source))
				failures.push(`missing source ${source}`)
		}
		const bytes = Buffer.byteLength(raw)
		if (bytes > testCase.maxBytes) {
			failures.push(`too many bytes ${bytes} > ${testCase.maxBytes}`)
		}
		return resultFor({
			testCase,
			startedAt,
			raw,
			failures,
			maxScore:
				testCase.requiredTools.length + testCase.requiredSources.length + 1,
		})
	} catch (err) {
		return resultForError(testCase, startedAt, err)
	}
}

async function runResourceCase(
	endpoint: string,
	testCase: ResourceCase,
): Promise<EvalResult> {
	const startedAt = performance.now()
	const failures = []
	try {
		const raw = await mcp(endpoint, {
			jsonrpc: '2.0',
			id: 1,
			method: 'resources/read',
			params: { uri: testCase.uri },
		})
		const body = JSON.parse(lastSseData(raw) ?? raw) as {
			result?: { contents?: Array<{ text?: string }> }
			error?: { message?: string }
		}
		if (body.error) failures.push(body.error.message ?? 'resource error')
		const text =
			body.result?.contents?.map((content) => content.text ?? '').join('\n') ??
			''
		for (const expected of testCase.expectedText) {
			if (!text.includes(expected)) failures.push(`missing text ${expected}`)
		}
		const bytes = Buffer.byteLength(raw)
		if (bytes > testCase.maxBytes) {
			failures.push(`too many bytes ${bytes} > ${testCase.maxBytes}`)
		}
		if (text.length > testCase.maxTextChars) {
			failures.push(`too much text ${text.length} > ${testCase.maxTextChars}`)
		}
		return resultFor({
			testCase,
			startedAt,
			raw,
			failures,
			maxScore: testCase.expectedText.length + 2,
			textChars: text.length,
		})
	} catch (err) {
		return resultForError(testCase, startedAt, err)
	}
}

async function runSearchCase(
	endpoint: string,
	testCase: SearchCase,
): Promise<EvalResult> {
	const startedAt = performance.now()
	const failures = []
	try {
		const raw = await mcp(endpoint, {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: {
				name: 'search',
				arguments: {
					query: testCase.query,
					...testCase.args,
				},
			},
		})
		const parsed = parseToolResponse(raw)
		if (parsed.error) failures.push(parsed.error)
		const chunks = parsed.result?.chunks ?? []
		const text = chunks.map((chunk) => chunk.text ?? '').join('\n')
		const urls = chunks
			.map((chunk) => chunk.url ?? chunk.item?.metadata?.url)
			.filter((url): url is string => typeof url === 'string')
		const sources = [
			...new Set(
				chunks
					.map(
						(chunk) =>
							chunk.source ??
							chunk.item?.metadata?.source ??
							sourceFromKey(chunk),
					)
					.filter((source): source is string => typeof source === 'string'),
			),
		]
		const duplicatePages = duplicatePageCount(chunks)
		for (const source of testCase.expectedSources ?? []) {
			if (!sources.includes(source)) failures.push(`missing source ${source}`)
		}
		for (const expectedUrl of testCase.expectedUrlIncludes ?? []) {
			if (!urls.some((url) => url.includes(expectedUrl))) {
				failures.push(`missing url ${expectedUrl}`)
			}
		}
		for (const expectedText of testCase.expectedTextIncludes ?? []) {
			if (!text.includes(expectedText))
				failures.push(`missing text ${expectedText}`)
		}
		if (chunks.length < testCase.minChunks) {
			failures.push(`too few chunks ${chunks.length} < ${testCase.minChunks}`)
		}
		if (chunks.length > testCase.maxChunks) {
			failures.push(`too many chunks ${chunks.length} > ${testCase.maxChunks}`)
		}
		if (Buffer.byteLength(raw) > testCase.maxBytes) {
			failures.push(
				`too many bytes ${Buffer.byteLength(raw)} > ${testCase.maxBytes}`,
			)
		}
		if (text.length > testCase.maxTextChars) {
			failures.push(`too much text ${text.length} > ${testCase.maxTextChars}`)
		}
		if (duplicatePages > testCase.maxDuplicatePages) {
			failures.push(
				`duplicate pages ${duplicatePages} > ${testCase.maxDuplicatePages}`,
			)
		}
		for (const term of noiseTerms) {
			if (text.includes(term)) failures.push(`noise term ${term}`)
		}
		return resultFor({
			testCase,
			startedAt,
			raw,
			failures,
			maxScore:
				(testCase.expectedSources?.length ?? 0) +
				(testCase.expectedUrlIncludes?.length ?? 0) +
				(testCase.expectedTextIncludes?.length ?? 0) +
				6,
			textChars: text.length,
			chunks: chunks.length,
			duplicatePages,
		})
	} catch (err) {
		return resultForError(testCase, startedAt, err)
	}
}

async function runFindPagesCase(
	endpoint: string,
	testCase: FindPagesCase,
): Promise<EvalResult> {
	const startedAt = performance.now()
	const failures = []
	try {
		const raw = await mcp(endpoint, {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: {
				name: 'find_pages',
				arguments: {
					source: testCase.source,
					query: testCase.query,
					max_results: testCase.maxPages,
					...(testCase.responseFormat
						? { response_format: testCase.responseFormat }
						: {}),
				},
			},
		})
		const parsed = parseToolResponse(raw)
		if (parsed.error) failures.push(parsed.error)
		const pages = parsed.result?.pages ?? []
		const urls = pages.map((page) => page.url)
		const titles = pages.map((page) => page.title).join('\n')
		if (parsed.result?.source !== testCase.source) {
			failures.push(`wrong source ${parsed.result?.source ?? 'none'}`)
		}
		for (const expectedUrl of testCase.expectedUrlIncludes) {
			if (!urls.some((url) => url.includes(expectedUrl))) {
				failures.push(`missing url ${expectedUrl}`)
			}
		}
		for (const expectedTitle of testCase.expectedTitleIncludes) {
			if (!titles.includes(expectedTitle)) {
				failures.push(`missing title ${expectedTitle}`)
			}
		}
		if (pages.length < 1) failures.push('no page candidates')
		if (pages.length > testCase.maxPages) {
			failures.push(`too many pages ${pages.length} > ${testCase.maxPages}`)
		}
		if (Buffer.byteLength(raw) > testCase.maxBytes) {
			failures.push(
				`too many bytes ${Buffer.byteLength(raw)} > ${testCase.maxBytes}`,
			)
		}
		return resultFor({
			testCase,
			startedAt,
			raw,
			failures,
			maxScore:
				1 +
				testCase.expectedUrlIncludes.length +
				testCase.expectedTitleIncludes.length +
				3,
		})
	} catch (err) {
		return resultForError(testCase, startedAt, err)
	}
}

async function runReadPageCase(
	endpoint: string,
	testCase: ReadPageCase,
): Promise<EvalResult> {
	const startedAt = performance.now()
	const failures = []
	try {
		const raw = await mcp(endpoint, {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: {
				name: 'read_page',
				arguments: {
					source: testCase.source,
					path: testCase.path,
					...(testCase.query ? { query: testCase.query } : {}),
					...(testCase.maxChars ? { max_chars: testCase.maxChars } : {}),
				},
			},
		})
		const parsed = parseToolResponse(raw)
		if (parsed.error) failures.push(parsed.error)
		const text = parsed.result?.text ?? ''
		const url = parsed.result?.url
		if (parsed.result?.source !== testCase.source) {
			failures.push(`wrong source ${parsed.result?.source ?? 'none'}`)
		}
		for (const expectedUrl of testCase.expectedUrlIncludes) {
			if (typeof url !== 'string' || !url.includes(expectedUrl)) {
				failures.push(`missing url ${expectedUrl}`)
			}
		}
		for (const expectedText of testCase.expectedTextIncludes) {
			if (!text.includes(expectedText))
				failures.push(`missing text ${expectedText}`)
		}
		if (Buffer.byteLength(raw) > testCase.maxBytes) {
			failures.push(
				`too many bytes ${Buffer.byteLength(raw)} > ${testCase.maxBytes}`,
			)
		}
		if (text.length > testCase.maxTextChars) {
			failures.push(`too much text ${text.length} > ${testCase.maxTextChars}`)
		}
		for (const term of noiseTerms) {
			if (text.includes(term)) failures.push(`noise term ${term}`)
		}
		return resultFor({
			testCase,
			startedAt,
			raw,
			failures,
			maxScore:
				1 +
				testCase.expectedUrlIncludes.length +
				testCase.expectedTextIncludes.length +
				3,
			textChars: text.length,
		})
	} catch (err) {
		return resultForError(testCase, startedAt, err)
	}
}

async function mcp(endpoint: string, body: unknown): Promise<string> {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			Accept: 'application/json, text/event-stream',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	})
	return response.text()
}

function resultFor(args: {
	testCase: EvalCase
	startedAt: number
	raw: string
	failures: string[]
	maxScore: number
	textChars?: number
	chunks?: number
	duplicatePages?: number
}): EvalResult {
	const uniqueFailures = [...new Set(args.failures)]
	return {
		name: args.testCase.name,
		kind: args.testCase.kind,
		passed: uniqueFailures.length === 0,
		score: Math.max(0, args.maxScore - uniqueFailures.length),
		max_score: args.maxScore,
		duration_ms: Math.round(performance.now() - args.startedAt),
		bytes: Buffer.byteLength(args.raw),
		text_chars: args.textChars ?? 0,
		chunks: args.chunks ?? 0,
		duplicate_pages: args.duplicatePages ?? 0,
		failures: uniqueFailures,
	}
}

function resultForError(
	testCase: EvalCase,
	startedAt: number,
	err: unknown,
): EvalResult {
	return {
		name: testCase.name,
		kind: testCase.kind,
		passed: false,
		score: 0,
		max_score: 1,
		duration_ms: Math.round(performance.now() - startedAt),
		bytes: 0,
		text_chars: 0,
		chunks: 0,
		duplicate_pages: 0,
		failures: [err instanceof Error ? err.message : String(err)],
	}
}

function parseToolResponse(raw: string): {
	result?: {
		chunks?: Chunk[]
		pages?: Array<{ title: string; url: string; score?: number }>
		source?: string
		url?: string
		text?: string
		truncated?: boolean
	}
	error?: string
} {
	const payload = JSON.parse(lastSseData(raw) ?? raw) as {
		result?: {
			content?: Array<{ text?: string }>
			structuredContent?: {
				success?: boolean
				result?: {
					chunks?: Chunk[]
					pages?: Array<{ title: string; url: string; score?: number }>
					source?: string
					url?: string
					text?: string
					truncated?: boolean
				}
				error?: string
			}
		}
		error?: { message?: string }
	}
	if (payload.error) return { error: payload.error.message ?? 'MCP error' }
	if (payload.result?.structuredContent) {
		const decoded = payload.result.structuredContent
		if (decoded.success === false)
			return { error: decoded.error ?? 'tool error' }
		return decoded
	}
	const text = payload.result?.content?.find((part) => part.text)?.text
	if (!text) return {}
	let decoded: {
		success?: boolean
		result?: {
			chunks?: Chunk[]
			pages?: Array<{ title: string; url: string; score?: number }>
			source?: string
			url?: string
			text?: string
			truncated?: boolean
		}
		error?: string
	}
	try {
		decoded = JSON.parse(text) as typeof decoded
	} catch {
		return { error: text }
	}
	if (decoded.success === false) return { error: decoded.error ?? 'tool error' }
	return decoded
}

function lastSseData(raw: string): string | undefined {
	return raw
		.split('\n')
		.filter((line) => line.startsWith('data: '))
		.map((line) => line.slice('data: '.length))
		.at(-1)
}

function sourceFromKey(chunk: Chunk): string | undefined {
	const key = chunk.key ?? chunk.item?.key
	const prefix = key?.split('/')[0]
	if (!prefix?.startsWith('https:')) return prefix
	return undefined
}

function duplicatePageCount(chunks: Chunk[]): number {
	const pages = chunks
		.map(pageIdentity)
		.filter((page): page is string => !!page)
	return pages.length - new Set(pages).size
}

function pageIdentity(chunk: Chunk): string | undefined {
	const url = chunk.url ?? chunk.item?.metadata?.url
	if (typeof url === 'string') {
		try {
			const parsed = new URL(url)
			parsed.hash = ''
			parsed.search = ''
			return parsed.toString().replace(/\/$/, '')
		} catch {
			return url
		}
	}
	return chunk.key ?? chunk.item?.key
}

function printEndpoint(result: EndpointResult, label: string): void {
	const summary = result.summary
	console.info(`MCP eval ${label}: ${result.endpoint}`)
	console.info(
		`score=${summary.score}/${summary.max_score} pass=${summary.passed}/${summary.total} pass_rate=${summary.pass_rate.toFixed(3)} bytes=${summary.bytes} chars=${summary.text_chars} dupes=${summary.duplicate_pages} p50=${summary.p50_ms}ms p95=${summary.p95_ms}ms`,
	)
	console.info(
		'case\tkind\tpass\tscore\tms\tbytes\tchars\tchunks\tdupes\tfailures',
	)
	for (const row of result.results) {
		console.info(
			[
				row.name,
				row.kind,
				row.passed ? 'yes' : 'no',
				`${row.score}/${row.max_score}`,
				row.duration_ms,
				row.bytes,
				row.text_chars,
				row.chunks,
				row.duplicate_pages,
				row.failures.join('|'),
			].join('\t'),
		)
	}
}

function printComparison(
	baseline: EndpointResult,
	candidate: EndpointResult,
): void {
	const base = baseline.summary
	const next = candidate.summary
	console.info('')
	console.info('Comparison candidate - baseline')
	console.info(
		[
			`score_delta=${next.score - base.score}`,
			`pass_delta=${next.passed - base.passed}`,
			`bytes_delta=${next.bytes - base.bytes}`,
			`chars_delta=${next.text_chars - base.text_chars}`,
			`dupes_delta=${next.duplicate_pages - base.duplicate_pages}`,
			`p95_delta_ms=${next.p95_ms - base.p95_ms}`,
		].join('\t'),
	)
}

function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0
	return values[Math.min(values.length - 1, Math.floor(values.length * p))]
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0)
}

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(name)
	return index === -1 ? undefined : process.argv[index + 1]
}

function isCli(): boolean {
	return process.argv[1]
		? import.meta.url === pathToFileURL(process.argv[1]).href
		: false
}
