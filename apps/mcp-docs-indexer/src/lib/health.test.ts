import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { healthMetrics } from './health.js'
import { flushWorkerMetrics } from './metrics.js'

const fetchMock = vi.fn()

beforeEach(() => {
	fetchMock.mockReset()
	vi.stubGlobal('fetch', fetchMock)
	vi.spyOn(console, 'log').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
	vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
	flushWorkerMetrics()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('healthMetrics', () => {
	it('checks the public MCP surface and emits health metrics', async () => {
		const logs: string[] = []
		vi.mocked(console.log).mockImplementation((message) => {
			logs.push(String(message))
		})
		fetchMock
			.mockResolvedValueOnce(
				json({
					result: {
						serverInfo: { name: 'tempo-docs' },
						capabilities: { tools: {}, resources: {} },
					},
				}),
			)
			.mockResolvedValueOnce(
				json({
					result: {
						tools: [
							{ name: 'search' },
							{ name: 'find_pages' },
							{ name: 'read_page' },
						],
					},
				}),
			)
			.mockResolvedValueOnce(
				json({
					result: { resources: [{ uri: 'tempo-docs://sources' }] },
				}),
			)
			.mockResolvedValueOnce(
				json({
					result: {
						structuredContent: {
							result: { retrieval: 'ai_search', chunks: [{ text: 'Tempo' }] },
						},
					},
				}),
			)
			.mockResolvedValueOnce(
				json({
					result: {
						structuredContent: {
							result: { pages: [{ url: 'https://docs.tempo.xyz/foo' }] },
						},
					},
				}),
			)
			.mockResolvedValueOnce(
				json({
					result: {
						structuredContent: { result: { text: 'Tempo docs page' } },
					},
				}),
			)

		await healthMetrics({ PUBLIC_MCP_ENDPOINT: 'https://mcp.tempo.xyz/' })
		flushWorkerMetrics()

		const metrics = logs
			.filter((message) => message.startsWith('cwm-'))
			.flatMap((message) => JSON.parse(message.slice('cwm-'.length)))
		expect(metrics).toContainEqual(
			expect.objectContaining({
				n: 'tempo_docs_mcp_health_ok',
				v: 1,
			}),
		)
		expect(fetchMock).toHaveBeenCalledTimes(6)
	})

	it('parses server-sent JSON-RPC responses', async () => {
		fetchMock
			.mockResolvedValueOnce(
				sse({
					result: {
						serverInfo: { name: 'tempo-docs' },
						capabilities: { tools: {}, resources: {} },
					},
				}),
			)
			.mockResolvedValueOnce(
				json({
					result: {
						tools: [
							{ name: 'search' },
							{ name: 'find_pages' },
							{ name: 'read_page' },
						],
					},
				}),
			)
			.mockResolvedValueOnce(
				json({ result: { resources: [{ uri: 'tempo-docs://sources' }] } }),
			)
			.mockResolvedValueOnce(
				json({
					result: {
						structuredContent: {
							result: { retrieval: 'ai_search', chunks: [{ text: 'Tempo' }] },
						},
					},
				}),
			)
			.mockResolvedValueOnce(
				json({
					result: {
						structuredContent: {
							result: { pages: [{ url: 'https://docs.tempo.xyz/foo' }] },
						},
					},
				}),
			)
			.mockResolvedValueOnce(
				json({
					result: {
						structuredContent: { result: { text: 'Tempo docs page' } },
					},
				}),
			)

		await healthMetrics({ PUBLIC_MCP_ENDPOINT: 'https://mcp.tempo.xyz/' })

		expect(console.error).not.toHaveBeenCalled()
	})
})

describe('healthMetrics failures', () => {
	it('reports fallback-only Tempo search as degraded, not down', async () => {
		const logs: string[] = []
		vi.mocked(console.log).mockImplementation((message) => {
			logs.push(String(message))
		})
		fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
			const { method, params } = JSON.parse(String(init?.body))
			if (method === 'initialize') {
				return json({
					result: {
						serverInfo: { name: 'tempo-docs' },
						capabilities: { tools: {}, resources: {} },
					},
				})
			}
			if (method === 'tools/list') {
				return json({
					result: {
						tools: [
							{ name: 'search' },
							{ name: 'find_pages' },
							{ name: 'read_page' },
						],
					},
				})
			}
			if (method === 'resources/list') {
				return json({
					result: { resources: [{ uri: 'tempo-docs://sources' }] },
				})
			}
			if (params?.name === 'search') {
				return json({
					result: {
						structuredContent: {
							result: {
								retrieval: 'source_index',
								chunks: [{ text: 'Tempo' }],
							},
						},
					},
				})
			}
			if (params?.name === 'find_pages') {
				return json({
					result: {
						structuredContent: {
							result: { pages: [{ url: 'https://tempo.xyz/developers/a' }] },
						},
					},
				})
			}
			return json({
				result: { structuredContent: { result: { text: 'Tempo docs page' } } },
			})
		})

		await healthMetrics({ PUBLIC_MCP_ENDPOINT: 'https://mcp.tempo.xyz/' })
		flushWorkerMetrics()

		const metrics = logs
			.filter((message) => message.startsWith('cwm-'))
			.flatMap((message) => JSON.parse(message.slice('cwm-'.length)))
		expect(metrics).toContainEqual(
			expect.objectContaining({ n: 'tempo_docs_mcp_health_ok', v: 1 }),
		)
		expect(metrics).toContainEqual(
			expect.objectContaining({
				n: 'tempo_docs_mcp_health_check_ok',
				v: 0,
				tags: expect.objectContaining({ check: 'search_tempo_indexed' }),
			}),
		)
		expect(console.error).not.toHaveBeenCalled()
		expect(String(vi.mocked(console.warn).mock.calls[0]?.[0])).toContain(
			'search used source_index retrieval',
		)
	})
})

function json(body: unknown): Response {
	return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }), {
		headers: { 'content-type': 'application/json' },
	})
}

function sse(body: unknown): Response {
	return new Response(
		`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, ...body })}\n\n`,
		{ headers: { 'content-type': 'text/event-stream' } },
	)
}
