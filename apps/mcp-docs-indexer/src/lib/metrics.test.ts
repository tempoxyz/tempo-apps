import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	flushWorkerMetrics,
	isFailedSyncReport,
	recordHealthMetrics,
	recordHttpRequestMetrics,
	recordIngestMetrics,
	recordSourceIndexStatus,
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

	it('emits source indexing state counts', () => {
		const logs: string[] = []
		vi.spyOn(console, 'log').mockImplementation((message) =>
			logs.push(String(message)),
		)
		recordSourceIndexStatus({
			source: 'tempo',
			counts: { completed: 5, error: 2 },
		})
		flushWorkerMetrics()
		const metrics = logs
			.filter((message) => message.startsWith('cwm-'))
			.flatMap((message) => JSON.parse(message.slice('cwm-'.length)))
		expect(metrics).toContainEqual(
			expect.objectContaining({
				n: 'tempo_docs_mcp_source_items',
				tags: expect.objectContaining({ source: 'tempo', status: 'error' }),
				v: 2,
			}),
		)
	})

	it('keeps ingestion healthy while removals await confirmation', () => {
		const logs: string[] = []
		vi.spyOn(console, 'log').mockImplementation((message) => {
			logs.push(String(message))
		})
		recordIngestMetrics({
			durationMs: 1,
			force: false,
			reports: [
				{
					source: 'docs',
					status: 'pending_deletion',
					removed: 1,
					duration_ms: 1,
				},
			],
		})
		flushWorkerMetrics()
		const metrics = logs
			.filter((message) => message.startsWith('cwm-'))
			.flatMap((message) => JSON.parse(message.slice('cwm-'.length)))
		expect(metrics).toContainEqual(
			expect.objectContaining({ n: 'tempo_docs_mcp_ingest_ok', v: 1 }),
		)
		expect(metrics).not.toContainEqual(
			expect.objectContaining({ n: 'tempo_docs_mcp_source_pages_failed' }),
		)
	})

	it.each([
		{ status: 'unchanged' as const, failed: 0, expected: 1 },
		{ status: 'synced' as const, failed: 0, expected: 1 },
		{ status: 'synced' as const, failed: 1, expected: 0 },
		{ status: 'pending_index' as const, failed: 1, expected: 0 },
		{ status: 'error' as const, failed: 0, expected: 0 },
	])('marks $status with $failed failed pages as $expected', ({
		status,
		failed,
		expected,
	}) => {
		const logs: string[] = []
		vi.spyOn(console, 'log').mockImplementation((message) => {
			logs.push(String(message))
		})
		const report =
			status === 'synced' || status === 'pending_index'
				? {
						source: 'docs',
						status,
						pages: 1,
						unchanged: 0,
						failed,
						deleted: 0,
						pending: status === 'pending_index' ? 1 : 0,
						duration_ms: 1,
					}
				: status === 'error'
					? { source: 'docs', status, error: 'failed', duration_ms: 1 }
					: { source: 'docs', status, duration_ms: 1 }
		expect(isFailedSyncReport(report)).toBe(expected === 0)
		recordIngestMetrics({ durationMs: 1, force: false, reports: [report] })
		flushWorkerMetrics()
		const metrics = logs
			.filter((message) => message.startsWith('cwm-'))
			.flatMap((message) => JSON.parse(message.slice('cwm-'.length)))
		expect(metrics).toContainEqual(
			expect.objectContaining({ n: 'tempo_docs_mcp_ingest_ok', v: expected }),
		)
	})

	it('reports pending AI Search items without treating queueing as a sync error', () => {
		const logs: string[] = []
		vi.spyOn(console, 'log').mockImplementation((message) => {
			logs.push(String(message))
		})
		recordIngestMetrics({
			durationMs: 1,
			force: false,
			reports: [
				{
					source: 'docs',
					status: 'pending_index',
					pages: 1,
					unchanged: 0,
					failed: 0,
					deleted: 0,
					pending: 1,
					duration_ms: 1,
				},
			],
		})
		flushWorkerMetrics()
		const metrics = logs
			.filter((message) => message.startsWith('cwm-'))
			.flatMap((message) => JSON.parse(message.slice('cwm-'.length)))
		expect(metrics).toContainEqual(
			expect.objectContaining({ n: 'tempo_docs_mcp_ingest_ok', v: 1 }),
		)
		expect(metrics).toContainEqual(
			expect.objectContaining({
				n: 'tempo_docs_mcp_source_items_pending',
				v: 1,
				tags: expect.objectContaining({ source: 'docs' }),
			}),
		)
	})
})
