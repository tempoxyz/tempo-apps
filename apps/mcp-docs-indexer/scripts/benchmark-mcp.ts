import { performance } from 'node:perf_hooks'

type Fixture = {
	name: string
	query: string
	expectedSources?: string[]
	expectedUrlIncludes?: string[]
	filterSource?: string
}

type PageFixture = {
	name: string
	source: string
	path: string
	query?: string
	expectedUrlIncludes: string[]
	expectedTextIncludes: string[]
}

type Variant = {
	name: string
	options?: Record<string, unknown>
}

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

type PageCandidate = {
	title?: string
	url?: string
	score?: number
}

type RunResult = {
	tool: 'search' | 'find_pages' | 'read_page'
	fixture: string
	variant: string
	duration_ms: number
	bytes: number
	text_chars: number
	chunks: number
	duplicate_pages: number
	top_score?: number
	sources: string[]
	expected_source_hit: boolean | undefined
	expected_url_hit: boolean | undefined
	expected_text_hit: boolean | undefined
	noise_hits: string[]
	error?: string
}

type BenchmarkFailure = {
	fixture: string
	variant: string
	reason: string
}

const ENDPOINT = arg('--endpoint') ?? 'https://mcp.tempo.xyz/'
const ITERATIONS = Number(arg('--iterations') ?? 1)
const JSON_OUTPUT = process.argv.includes('--json')
const STRICT = process.argv.includes('--strict')
const DEFAULT_SEARCH_MAX_BYTES = 5_000
const DEFAULT_SEARCH_MAX_TEXT_CHARS = 3_000
const DEFAULT_READ_PAGE_MAX_BYTES = 6_000
const DEFAULT_READ_PAGE_MAX_TEXT_CHARS = 5_000
const BOUNDED_READ_PAGE_MAX_BYTES = 4_000
const BOUNDED_READ_PAGE_MAX_TEXT_CHARS = 3_200
const FOCUSED_READ_PAGE_MAX_BYTES = 2_500
const FOCUSED_READ_PAGE_MAX_TEXT_CHARS = 1_700
const FIND_PAGES_MAX_BYTES = 1_500

const fixtures: Fixture[] = [
	{
		name: 'viem_fee_token',
		query: 'How do I pay Tempo transaction fees in a stablecoin using viem?',
		expectedSources: ['viem'],
		expectedUrlIncludes: ['viem.sh/tempo'],
		filterSource: 'viem',
	},
	{
		name: 'wagmi_tempo_wallet',
		query: 'How do I configure the wagmi tempoWallet connector?',
		expectedSources: ['wagmi'],
		expectedUrlIncludes: ['wagmi.sh/react/api/connectors/tempoWallet'],
		filterSource: 'wagmi',
	},
	{
		name: 'mpp_mcp_transport',
		query: 'How does MPP payment work over MCP JSON-RPC transport?',
		expectedSources: ['mpp'],
		expectedUrlIncludes: ['mpp.dev/protocol/transports'],
		filterSource: 'mpp',
	},
	{
		name: 'regen_button',
		query: 'What Regen UI Button variants are available?',
		expectedSources: ['regen'],
		expectedUrlIncludes: ['regen.tempo.xyz/button'],
		filterSource: 'regen',
	},
	{
		name: 'vocs_mcp_server',
		query: 'How do I expose a Vocs docs site as an MCP server?',
		expectedSources: ['vocs'],
		expectedUrlIncludes: ['vocs.dev/features/mcp-server'],
		filterSource: 'vocs',
	},
	{
		name: 'tempo_virtual_addresses',
		query: 'How do virtual addresses work for TIP-20 deposits on Tempo?',
		expectedSources: ['tempo'],
		expectedUrlIncludes: ['docs.tempo.xyz/guide/payments/virtual-addresses'],
		filterSource: 'tempo',
	},
]

const pageFixtures: PageFixture[] = [
	{
		name: 'read_tempo_virtual_addresses',
		source: 'tempo',
		path: '/guide/payments/virtual-addresses',
		query: 'virtual addresses deposits',
		expectedUrlIncludes: ['docs.tempo.xyz/guide/payments/virtual-addresses'],
		expectedTextIncludes: ['# Use virtual addresses for deposits'],
	},
	{
		name: 'read_vocs_mcp_server',
		source: 'vocs',
		path: '/features/mcp-server',
		query: 'MCP Server McpSource.github',
		expectedUrlIncludes: ['vocs.dev/features/mcp-server'],
		expectedTextIncludes: ['# MCP Server', 'McpSource.github'],
	},
	{
		name: 'read_regen_button',
		source: 'regen',
		path: '/button',
		query: 'Button variants',
		expectedUrlIncludes: ['regen.tempo.xyz/button'],
		expectedTextIncludes: ['Button'],
	},
]

const variants: Variant[] = [
	{ name: 'default' },
	{
		name: 'structured',
		options: { max_results: 5, response_format: 'structured' },
	},
	{
		name: 'compact',
		options: {
			max_results: 5,
			ai_search_options: {
				ranking_options: { score_threshold: 0.45 },
				reranking: { enabled: true },
			},
		},
	},
]

const noiseTerms = [
	'Skip to content',
	'Was this helpful?',
	'Copy page for AI',
	'Ask AI...',
	'Search...',
]

const results: RunResult[] = []
for (let i = 0; i < ITERATIONS; i++) {
	for (const fixture of fixtures) {
		for (const variant of variantsFor(fixture)) {
			results.push(await runFixture(fixture, variant))
		}
		if (fixture.filterSource) {
			results.push(await runFindPagesFixture(fixture))
		}
	}
	for (const fixture of pageFixtures) {
		results.push(await runReadPageFixture(fixture, { name: 'default' }))
		results.push(
			await runReadPageFixture(fixture, {
				name: 'bounded',
				options: { max_chars: 3000 },
			}),
		)
		results.push(
			await runReadPageFixture(fixture, {
				name: 'focused',
				options: { max_chars: 1500, query: fixture.query },
			}),
		)
		results.push(
			await runReadPageFixture(fixture, {
				name: 'focused_structured',
				options: {
					max_chars: 1500,
					query: fixture.query,
					response_format: 'structured',
				},
			}),
		)
	}
}

const failures = benchmarkFailures(results)
if (JSON_OUTPUT) {
	console.info(
		JSON.stringify(
			{ endpoint: ENDPOINT, iterations: ITERATIONS, results, failures },
			null,
			2,
		),
	)
} else {
	printSummary(results)
	if (failures.length > 0) {
		console.info('failures')
		for (const failure of failures) {
			console.info(`${failure.fixture}\t${failure.variant}\t${failure.reason}`)
		}
	}
}

if (STRICT && failures.length > 0) {
	process.exitCode = 1
}

function variantsFor(fixture: Fixture): Variant[] {
	if (!fixture.filterSource) return variants
	return [
		...variants,
		{
			name: 'filtered',
			options: {
				max_results: 5,
				source: fixture.filterSource,
				ai_search_options: {
					ranking_options: { score_threshold: 0.35 },
					reranking: { enabled: true },
				},
			},
		},
	]
}

async function runFixture(
	fixture: Fixture,
	variant: Variant,
): Promise<RunResult> {
	const startedAt = performance.now()
	try {
		const response = await fetch(ENDPOINT, {
			method: 'POST',
			headers: {
				Accept: 'application/json, text/event-stream',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'search',
					arguments: {
						query: fixture.query,
						...variant.options,
					},
				},
			}),
		})
		const raw = await response.text()
		const durationMs = Math.round(performance.now() - startedAt)
		const parsed = parseMcpResponse(raw)
		const chunks = parsed.result?.chunks ?? []
		const text = chunks.map((chunk) => chunk.text ?? '').join('\n')
		const urls = chunks
			.map((chunk) => chunk.url ?? chunk.item?.metadata?.url)
			.filter((url): url is string => typeof url === 'string')
		const duplicatePages = duplicatePageCount(chunks)
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

		return {
			tool: 'search',
			fixture: fixture.name,
			variant: variant.name,
			duration_ms: durationMs,
			bytes: Buffer.byteLength(raw),
			text_chars: text.length,
			chunks: chunks.length,
			duplicate_pages: duplicatePages,
			...(typeof chunks[0]?.score === 'number'
				? { top_score: chunks[0].score }
				: {}),
			sources,
			expected_source_hit: fixture.expectedSources
				? fixture.expectedSources.some((source) => sources.includes(source))
				: undefined,
			expected_url_hit: fixture.expectedUrlIncludes
				? fixture.expectedUrlIncludes.some((needle) =>
						urls.some((url) => url.includes(needle)),
					)
				: undefined,
			expected_text_hit: undefined,
			noise_hits: noiseTerms.filter((term) => text.includes(term)),
			...(parsed.error ? { error: parsed.error } : {}),
		}
	} catch (err) {
		return {
			tool: 'search',
			fixture: fixture.name,
			variant: variant.name,
			duration_ms: Math.round(performance.now() - startedAt),
			bytes: 0,
			text_chars: 0,
			chunks: 0,
			duplicate_pages: 0,
			sources: [],
			expected_source_hit: fixture.expectedSources ? false : undefined,
			expected_url_hit: fixture.expectedUrlIncludes ? false : undefined,
			expected_text_hit: undefined,
			noise_hits: [],
			error: err instanceof Error ? err.message : String(err),
		}
	}
}

async function runFindPagesFixture(fixture: Fixture): Promise<RunResult> {
	const startedAt = performance.now()
	try {
		const response = await fetch(ENDPOINT, {
			method: 'POST',
			headers: {
				Accept: 'application/json, text/event-stream',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'find_pages',
					arguments: {
						source: fixture.filterSource,
						query: fixture.query,
						max_results: 5,
						response_format: 'structured',
					},
				},
			}),
		})
		const raw = await response.text()
		const durationMs = Math.round(performance.now() - startedAt)
		const parsed = parseMcpResponse(raw)
		const pages = parsed.result?.pages ?? []
		const urls = pages
			.map((page) => page.url)
			.filter((url): url is string => typeof url === 'string')

		return {
			tool: 'find_pages',
			fixture: fixture.name,
			variant: 'index',
			duration_ms: durationMs,
			bytes: Buffer.byteLength(raw),
			text_chars: pages.map((page) => page.title ?? '').join('\n').length,
			chunks: pages.length,
			duplicate_pages: 0,
			...(typeof pages[0]?.score === 'number'
				? { top_score: pages[0].score }
				: {}),
			sources: fixture.filterSource ? [fixture.filterSource] : [],
			expected_source_hit: fixture.expectedSources
				? fixture.expectedSources.includes(fixture.filterSource ?? '')
				: undefined,
			expected_url_hit: fixture.expectedUrlIncludes
				? fixture.expectedUrlIncludes.some((needle) =>
						urls.some((url) => url.includes(needle)),
					)
				: undefined,
			expected_text_hit: undefined,
			noise_hits: [],
			...(parsed.error ? { error: parsed.error } : {}),
		}
	} catch (err) {
		return {
			tool: 'find_pages',
			fixture: fixture.name,
			variant: 'index',
			duration_ms: Math.round(performance.now() - startedAt),
			bytes: 0,
			text_chars: 0,
			chunks: 0,
			duplicate_pages: 0,
			sources: fixture.filterSource ? [fixture.filterSource] : [],
			expected_source_hit: fixture.expectedSources ? false : undefined,
			expected_url_hit: fixture.expectedUrlIncludes ? false : undefined,
			expected_text_hit: undefined,
			noise_hits: [],
			error: err instanceof Error ? err.message : String(err),
		}
	}
}

async function runReadPageFixture(
	fixture: PageFixture,
	variant: Variant,
): Promise<RunResult> {
	const startedAt = performance.now()
	try {
		const response = await fetch(ENDPOINT, {
			method: 'POST',
			headers: {
				Accept: 'application/json, text/event-stream',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'read_page',
					arguments: {
						source: fixture.source,
						path: fixture.path,
						...variant.options,
					},
				},
			}),
		})
		const raw = await response.text()
		const durationMs = Math.round(performance.now() - startedAt)
		const parsed = parseMcpResponse(raw)
		const text = parsed.result?.text ?? ''
		const url = parsed.result?.url

		return {
			tool: 'read_page',
			fixture: fixture.name,
			variant: variant.name,
			duration_ms: durationMs,
			bytes: Buffer.byteLength(raw),
			text_chars: text.length,
			chunks: 0,
			duplicate_pages: 0,
			sources: parsed.result?.source ? [parsed.result.source] : [],
			expected_source_hit: parsed.result?.source === fixture.source,
			expected_url_hit: fixture.expectedUrlIncludes.some(
				(needle) => typeof url === 'string' && url.includes(needle),
			),
			expected_text_hit: fixture.expectedTextIncludes.every((needle) =>
				text.includes(needle),
			),
			noise_hits: noiseTerms.filter((term) => text.includes(term)),
			...(parsed.error ? { error: parsed.error } : {}),
		}
	} catch (err) {
		return {
			tool: 'read_page',
			fixture: fixture.name,
			variant: variant.name,
			duration_ms: Math.round(performance.now() - startedAt),
			bytes: 0,
			text_chars: 0,
			chunks: 0,
			duplicate_pages: 0,
			sources: [],
			expected_source_hit: false,
			expected_url_hit: false,
			expected_text_hit: false,
			noise_hits: [],
			error: err instanceof Error ? err.message : String(err),
		}
	}
}

function parseMcpResponse(raw: string): {
	result?: {
		chunks?: Chunk[]
		pages?: PageCandidate[]
		source?: string
		url?: string
		text?: string
		truncated?: boolean
	}
	error?: string
} {
	const dataLines = raw
		.split('\n')
		.filter((line) => line.startsWith('data: '))
		.map((line) => line.slice('data: '.length))
	const payload = JSON.parse(dataLines.at(-1) ?? raw) as {
		result?: {
			content?: Array<{ text?: string }>
			structuredContent?: {
				success?: boolean
				result?: {
					chunks?: Chunk[]
					pages?: PageCandidate[]
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
	const decoded = JSON.parse(text) as {
		success?: boolean
		result?: {
			chunks?: Chunk[]
			pages?: PageCandidate[]
			source?: string
			url?: string
			text?: string
			truncated?: boolean
		}
		error?: string
	}
	if (decoded.success === false) return { error: decoded.error ?? 'tool error' }
	return decoded
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

function printSummary(rows: RunResult[]) {
	console.info(`MCP benchmark: ${ENDPOINT}`)
	console.info(
		[
			'tool',
			'fixture',
			'variant',
			'ms',
			'bytes',
			'chars',
			'chunks',
			'dupe_pages',
			'top_score',
			'sources',
			'source_hit',
			'url_hit',
			'text_hit',
			'noise',
			'error',
		].join('\t'),
	)
	for (const row of rows) {
		console.info(
			[
				row.tool,
				row.fixture,
				row.variant,
				row.duration_ms,
				row.bytes,
				row.text_chars,
				row.chunks,
				row.duplicate_pages,
				row.top_score?.toFixed(3) ?? '',
				row.sources.join(','),
				formatHit(row.expected_source_hit),
				formatHit(row.expected_url_hit),
				formatHit(row.expected_text_hit),
				row.noise_hits.join('|'),
				row.error ?? '',
			].join('\t'),
		)
	}
	const okRows = rows.filter((row) => !row.error)
	const durations = okRows.map((row) => row.duration_ms).sort((a, b) => a - b)
	const bytes = sum(okRows.map((row) => row.bytes))
	const chars = sum(okRows.map((row) => row.text_chars))
	console.info(
		`summary\tp50_ms=${percentile(durations, 0.5)}\tp95_ms=${percentile(durations, 0.95)}\ttotal_bytes=${bytes}\ttotal_text_chars=${chars}`,
	)
	for (const variant of [...new Set(rows.map((row) => row.variant))]) {
		const variantRows = okRows.filter((row) => row.variant === variant)
		const variantDurations = variantRows
			.map((row) => row.duration_ms)
			.sort((a, b) => a - b)
		console.info(
			`summary:${variant}\tp50_ms=${percentile(variantDurations, 0.5)}\tp95_ms=${percentile(variantDurations, 0.95)}\ttotal_bytes=${sum(variantRows.map((row) => row.bytes))}\ttotal_text_chars=${sum(variantRows.map((row) => row.text_chars))}`,
		)
	}
	for (const tool of [...new Set(rows.map((row) => row.tool))]) {
		const toolRows = okRows.filter((row) => row.tool === tool)
		const toolDurations = toolRows
			.map((row) => row.duration_ms)
			.sort((a, b) => a - b)
		console.info(
			`summary:${tool}\tp50_ms=${percentile(toolDurations, 0.5)}\tp95_ms=${percentile(toolDurations, 0.95)}\ttotal_bytes=${sum(toolRows.map((row) => row.bytes))}\ttotal_text_chars=${sum(toolRows.map((row) => row.text_chars))}`,
		)
	}
}

function benchmarkFailures(rows: RunResult[]): BenchmarkFailure[] {
	return rows.flatMap((row) =>
		failuresFor(row).map((reason) => ({
			fixture: row.fixture,
			variant: row.variant,
			reason,
		})),
	)
}

function failuresFor(row: RunResult): string[] {
	const failures = []
	if (row.error) failures.push(row.error)
	if (row.expected_source_hit === false)
		failures.push('missing expected source')
	if (row.expected_url_hit === false) failures.push('missing expected url')
	if (row.expected_text_hit === false) failures.push('missing expected text')
	if (row.noise_hits.length > 0) {
		failures.push(`noise terms: ${row.noise_hits.join(', ')}`)
	}
	if (row.duplicate_pages > 0) {
		failures.push(`duplicate pages: ${row.duplicate_pages}`)
	}

	if (row.tool === 'search') {
		if (row.chunks < 1) failures.push('no search chunks')
		if (row.chunks > 5) failures.push(`too many search chunks: ${row.chunks}`)
		if (row.bytes > DEFAULT_SEARCH_MAX_BYTES) {
			failures.push(
				`too many bytes: ${row.bytes} > ${DEFAULT_SEARCH_MAX_BYTES}`,
			)
		}
		if (row.text_chars > DEFAULT_SEARCH_MAX_TEXT_CHARS) {
			failures.push(
				`too many text chars: ${row.text_chars} > ${DEFAULT_SEARCH_MAX_TEXT_CHARS}`,
			)
		}
	}

	if (row.tool === 'find_pages') {
		if (row.chunks < 1) failures.push('no page candidates')
		if (row.chunks > 5) failures.push(`too many page candidates: ${row.chunks}`)
		if (row.bytes > FIND_PAGES_MAX_BYTES) {
			failures.push(`too many bytes: ${row.bytes} > ${FIND_PAGES_MAX_BYTES}`)
		}
	}

	if (row.tool === 'read_page') {
		const maxBytes = readPageMaxBytesFor(row.variant)
		const maxTextChars = readPageMaxTextCharsFor(row.variant)
		if (row.bytes > maxBytes) {
			failures.push(`too many bytes: ${row.bytes} > ${maxBytes}`)
		}
		if (row.text_chars > maxTextChars) {
			failures.push(`too many text chars: ${row.text_chars} > ${maxTextChars}`)
		}
	}
	return failures
}

function readPageMaxBytesFor(variant: string): number {
	if (variant.startsWith('focused')) return FOCUSED_READ_PAGE_MAX_BYTES
	if (variant === 'bounded') return BOUNDED_READ_PAGE_MAX_BYTES
	return DEFAULT_READ_PAGE_MAX_BYTES
}

function readPageMaxTextCharsFor(variant: string): number {
	if (variant.startsWith('focused')) return FOCUSED_READ_PAGE_MAX_TEXT_CHARS
	if (variant === 'bounded') return BOUNDED_READ_PAGE_MAX_TEXT_CHARS
	return DEFAULT_READ_PAGE_MAX_TEXT_CHARS
}

function formatHit(value: boolean | undefined): string {
	if (value === undefined) return ''
	return value ? 'yes' : 'no'
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
