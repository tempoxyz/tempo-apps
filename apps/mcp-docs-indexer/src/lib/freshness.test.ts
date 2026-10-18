import { describe, expect, it, vi } from 'vitest'
import { recordSourceFreshness } from './freshness.js'
import type { SyncReport } from './ingest.js'
import { workerMetrics } from './metrics.js'

describe('source freshness', () => {
	it.each([
		{ status: 'unchanged', ready: '10000', pending: undefined },
		{ status: 'synced', ready: '10000', pending: undefined },
		{ status: 'pending_index', ready: '1000', pending: '2000' },
		{ status: 'error', ready: '1000', pending: '2000' },
		{ status: 'pending_deletion', ready: '1000', pending: '2000' },
	] as const)('tracks $status without treating uploads as readiness', async ({
		status,
		ready,
		pending,
	}) => {
		const store = new Map([
			['last_ready:tempo', '1000'],
			['pending_since:tempo', '2000'],
		])
		const kv = {
			get: async (key: string) => store.get(key) ?? null,
			put: async (key: string, value: string) => {
				store.set(key, value)
			},
			delete: async (key: string) => {
				store.delete(key)
			},
		} as unknown as KVNamespace
		const gauge = vi.spyOn(workerMetrics, 'gauge').mockImplementation(() => {})
		try {
			await recordSourceFreshness(
				kv,
				{
					source: 'tempo',
					status,
					duration_ms: 1,
					failed: 0,
					pages: 1,
					pending: 1,
				} as SyncReport,
				10000,
			)
			expect(store.get('last_ready:tempo')).toBe(ready)
			expect(store.get('pending_since:tempo')).toBe(pending)
			expect(gauge).toHaveBeenCalledWith(
				'tempo_docs_mcp_source_ready_age_seconds',
				(10000 - Number(ready)) / 1000,
				{ source: 'tempo' },
			)
		} finally {
			gauge.mockRestore()
		}
	})
})

it('tracks stalled backlogs and resets only on completed growth or an empty backlog', async () => {
	const { recordIndexProgress } = await import('./freshness.js')
	const store = new Map<string, string>()
	const kv = {
		get: async (key: string) => store.get(key) ?? null,
		put: async (key: string, value: string) => {
			store.set(key, value)
		},
	} as unknown as KVNamespace
	const gauge = vi.spyOn(workerMetrics, 'gauge').mockImplementation(() => {})
	try {
		for (const [now, completed, queued, stalled] of [
			[1000, 2, 10, 0],
			[11000, 2, 9, 10],
			[21000, 3, 8, 0],
			[31000, 2, 9, 10],
			[41000, 2, 0, 0],
		]) {
			await recordIndexProgress(
				kv,
				{ source: 'tempo', counts: { completed, queued, running: 0 } },
				'tempo:new',
				now,
			)
			expect(gauge).toHaveBeenLastCalledWith(
				'tempo_docs_mcp_source_index_stalled_seconds',
				stalled,
				{ source: 'tempo' },
			)
		}
		const before = store.get('index_progress:tempo:new')
		gauge.mockClear()
		await recordIndexProgress(
			kv,
			{ source: 'tempo', counts: { completed: 10 } },
			'tempo:new',
			51000,
		)
		expect(store.get('index_progress:tempo:new')).toBe(before)
		expect(gauge).not.toHaveBeenCalled()
	} finally {
		gauge.mockRestore()
	}
})
