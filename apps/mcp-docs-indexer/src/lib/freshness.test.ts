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
