import { createExecutionContext } from 'cloudflare:test'
import { env as bindings } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index.js'
import { handleMcp } from '../src/lib/mcp.js'
import { captureMcpAnalytics } from '../src/lib/posthog-mcp.js'
import { MAX_MCP_REQUEST_BYTES } from '../src/lib/request.js'

vi.mock('@cloudflare/codemode', () => ({
	DynamicWorkerExecutor: class {},
}))
vi.mock('../src/lib/mcp.js', () => ({ handleMcp: vi.fn() }))
vi.mock('../src/lib/posthog-mcp.js', () => ({ captureMcpAnalytics: vi.fn() }))
vi.mock('../src/lib/metrics.js', () => ({
	flushWorkerMetrics: vi.fn(),
	isFailedSyncReport: vi.fn(),
	recordHttpRequestMetrics: vi.fn(),
	recordIngestMetrics: vi.fn(),
	recordHealthMetrics: vi.fn(),
	recordProxyFallback: vi.fn(),
}))
vi.mock('../src/lib/log.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/lib/log.js')>()),
	log: { error: vi.fn(), info: vi.fn() },
}))

const env = Object.assign({}, bindings, {
	AI_SEARCH: { get: vi.fn() },
	AI_SEARCH_INSTANCE_ID: 'test',
	AI_SEARCH_MCP_URL: 'https://upstream.example/mcp',
	LOADER: {},
	SOURCES: [],
})
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>
let ctx: ExecutionContext

beforeEach(() => {
	ctx = createExecutionContext()
	vi.mocked(handleMcp).mockResolvedValue(new Response('{}'))
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('upstream')),
	)
})

afterEach(() => {
	vi.restoreAllMocks()
	vi.clearAllMocks()
	vi.unstubAllGlobals()
})

describe('MCP request bodies', () => {
	it('rejects oversized Content-Length before reading or handling the body', async () => {
		const pull = vi.fn()
		const cancel = vi.fn()
		const req = streamedRequest(
			new ReadableStream({ pull, cancel }, { highWaterMark: 0 }),
			String(MAX_MCP_REQUEST_BYTES + 1),
		)

		const response = await worker.fetch(req, env, ctx)

		expect(response.status).toBe(413)
		expect(pull).not.toHaveBeenCalled()
		expect(cancel).toHaveBeenCalledOnce()
		expect(handleMcp).not.toHaveBeenCalled()
		expect(captureMcpAnalytics).not.toHaveBeenCalled()
		expect(fetch).not.toHaveBeenCalled()
	})

	it.each([
		undefined,
		'1',
	])('rejects oversized streamed bodies with Content-Length %s', async (contentLength) => {
		const cancel = vi.fn()
		const chunk = new TextEncoder().encode('é'.repeat(16 * 1024))
		const pull = vi.fn((controller) => controller.enqueue(chunk))
		const req = streamedRequest(
			new ReadableStream({ pull, cancel }, { highWaterMark: 0 }),
			contentLength,
		)

		const response = await worker.fetch(req, env, ctx)

		expect(response.status).toBe(413)
		await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce())
		expect(pull.mock.calls.length).toBeLessThanOrEqual(
			MAX_MCP_REQUEST_BYTES / chunk.byteLength + 2,
		)
		expect(handleMcp).not.toHaveBeenCalled()
		expect(captureMcpAnalytics).not.toHaveBeenCalled()
		expect(fetch).not.toHaveBeenCalled()
	})

	it('accepts the exact byte limit and shares one parsed body with analytics', async () => {
		const prefix = '{"jsonrpc":"2.0","id":1,"method":"tools/list","padding":"'
		const raw = `${prefix}${' '.repeat(MAX_MCP_REQUEST_BYTES - prefix.length - 2)}"}`
		const bytes = new TextEncoder().encode(raw)
		let offset = 0
		const req = streamedRequest(
			new ReadableStream({
				pull(controller) {
					if (offset >= bytes.byteLength) controller.close()
					else {
						controller.enqueue(bytes.subarray(offset, offset + 12345))
						offset += 12345
					}
				},
			}),
		)
		const clone = vi.spyOn(req, 'clone')
		const parse = vi.spyOn(JSON, 'parse')

		const response = await worker.fetch(req, env, ctx)

		expect(response.status).toBe(200)
		expect(parse.mock.calls.filter(([input]) => input === raw)).toHaveLength(1)
		expect(clone).not.toHaveBeenCalled()
		const [request, , body] = vi.mocked(handleMcp).mock.calls[0]
		expect(body).toMatchObject({ id: 1, method: 'tools/list' })
		expect(captureMcpAnalytics).toHaveBeenCalledWith(
			request,
			body,
			response,
			env,
			ctx,
		)
		expect(fetch).not.toHaveBeenCalled()
	})

	it.each([
		new TextEncoder().encode(
			'{ "jsonrpc": "2.0", "id": 1, "method": "initialize" }',
		),
		new TextEncoder().encode('null'),
		new TextEncoder().encode('[]'),
		new Uint8Array([123, 255, 125]),
	])('preserves fallback request bytes: %j', async (raw) => {
		vi.mocked(handleMcp).mockResolvedValue(undefined)
		const req = new IncomingRequest('https://mcp.tempo.xyz/mcp', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'mcp-session-id': 'session',
			},
			body: raw,
		})

		const response = await worker.fetch(req, env, ctx)

		expect(await response.text()).toBe('upstream')
		const [url, init] = vi.mocked(fetch).mock.calls[0]
		expect(url).toBe(env.AI_SEARCH_MCP_URL)
		expect(init?.method).toBe('POST')
		expect(new Headers(init?.headers).get('mcp-session-id')).toBe('session')
		expect(
			new Uint8Array(await new Response(init?.body).arrayBuffer()),
		).toEqual(raw)
	})

	it('preserves the body when local handling fails', async () => {
		vi.mocked(handleMcp).mockRejectedValue(new Error('local failure'))
		const raw = '{"id":1,"method":"tools/list"}'
		const req = new IncomingRequest('https://mcp.tempo.xyz/', {
			method: 'POST',
			body: raw,
		})

		const response = await worker.fetch(req, env, ctx)

		expect(await response.text()).toBe('upstream')
		const [, init] = vi.mocked(fetch).mock.calls[0]
		expect(await new Response(init?.body).text()).toBe(raw)
	})
})

function streamedRequest(
	body: ReadableStream<Uint8Array>,
	contentLength?: string,
) {
	const init = {
		method: 'POST',
		body,
		duplex: 'half',
		headers: contentLength ? { 'content-length': contentLength } : undefined,
	}
	return new IncomingRequest('https://mcp.tempo.xyz/', init)
}
