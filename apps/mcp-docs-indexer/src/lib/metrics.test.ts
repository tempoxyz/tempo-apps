import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	flushWorkerMetrics,
	recordHealthMetrics,
	recordHttpRequestMetrics,
	recordToolCall,
} from './metrics.js'

describe('worker metrics', () => {
	afterEach(() => {
		flushWorkerMetrics()
		vi.restoreAllMocks()
	})

	it('flushes cwm lines with docs MCP global tags', () => {
		const logs: string[] = []
		vi.spyOn(console, 'log').mockImplementation((message) => {
			logs.push(String(message))
		})

		recordHttpRequestMetrics({
			durationMs: 12,
			method: 'POST',
			route: 'mcp',
			status: 200,
		})
		recordToolCall('search', 'success', 9)
		recordHealthMetrics({
			durationMs: 20,
			checks: [{ name: 'tools_list', ok: true, durationMs: 3 }],
		})
		flushWorkerMetrics()

		const metrics = logs
			.filter((message) => message.startsWith('cwm-'))
			.flatMap((message) => JSON.parse(message.slice('cwm-'.length)))
		expect(metrics).toContainEqual(
			expect.objectContaining({
				n: 'tempo_docs_mcp_http_request_count',
				tags: expect.objectContaining({
					component: 'docs_mcp',
					repository: 'tempo-apps',
					service: 'tempo-docs-mcp',
					route: 'mcp',
				}),
				v: 1,
			}),
		)
		expect(metrics).toContainEqual(
			expect.objectContaining({
				n: 'tempo_docs_mcp_tool_call_count',
				tags: expect.objectContaining({
					outcome: 'success',
					tool_name: 'search',
				}),
				v: 1,
			}),
		)
		expect(metrics).toContainEqual(
			expect.objectContaining({
				n: 'tempo_docs_mcp_health_ok',
				v: 1,
			}),
		)
	})
})
