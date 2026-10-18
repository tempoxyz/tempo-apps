import { withTimeout } from './timeout.js'
import type { SyncReport } from './ingest.js'
import { isFailedSyncReport, workerMetrics } from './metrics.js'

/** Track confirmed readiness separately from successful uploads. */
export async function recordSourceFreshness(
	kv: KVNamespace,
	report: SyncReport,
	now = Date.now(),
	stateId = report.source,
): Promise<void> {
	const readyKey = `last_ready:${stateId}`
	const pendingKey = `pending_since:${stateId}`
	let ready = await withTimeout(() => kv.get(readyKey), 5000)
	let pending = await withTimeout(() => kv.get(pendingKey), 5000)
	if (
		!isFailedSyncReport(report) &&
		(report.status === 'synced' || report.status === 'unchanged')
	) {
		ready = String(now)
		await withTimeout(() => kv.put(readyKey, String(now)), 5000)
	}
	if (report.status === 'pending_index') {
		if (!pending) {
			pending = String(now)
			await withTimeout(() => kv.put(pendingKey, String(now)), 5000)
		}
	} else if (
		!isFailedSyncReport(report) &&
		(report.status === 'synced' || report.status === 'unchanged')
	) {
		pending = null
		await withTimeout(() => kv.delete(pendingKey), 5000)
	}
	const tags = { source: report.source }
	if (ready !== null && Number.isFinite(Number(ready))) {
		workerMetrics.gauge(
			'tempo_docs_mcp_source_ready_age_seconds',
			Math.max(0, (now - Number(ready)) / 1000),
			tags,
		)
	}
	if (pending !== null && Number.isFinite(Number(pending))) {
		workerMetrics.gauge(
			'tempo_docs_mcp_source_pending_age_seconds',
			Math.max(0, (now - Number(pending)) / 1000),
			tags,
		)
	} else if (
		!isFailedSyncReport(report) &&
		(report.status === 'synced' || report.status === 'unchanged')
	) {
		workerMetrics.gauge('tempo_docs_mcp_source_pending_age_seconds', 0, tags)
	}
}

/** Track actual completed-item growth; uploads and queue churn are not progress. */
export async function recordIndexProgress(
	kv: KVNamespace,
	status: import('./ingest.js').SourceIndexStatus,
	stateId: string,
	now = Date.now(),
): Promise<void> {
	const { completed, queued, running } = status.counts
	if (completed === undefined || queued === undefined || running === undefined)
		return
	const key = `index_progress:${stateId}`
	const raw = await withTimeout(() => kv.get(key), 5000)
	const previous = raw
		? (JSON.parse(raw) as { completed: number; advanced: number })
		: undefined
	const growth = previous ? Math.max(0, completed - previous.completed) : 0
	const advanced =
		!previous || growth > 0 || queued + running === 0 ? now : previous.advanced
	await withTimeout(
		() => kv.put(key, JSON.stringify({ completed, advanced })),
		5000,
	)
	workerMetrics.gauge('tempo_docs_mcp_source_index_completed_growth', growth, {
		source: status.source,
	})
	workerMetrics.gauge(
		'tempo_docs_mcp_source_index_stalled_seconds',
		queued + running > 0 ? Math.max(0, (now - advanced) / 1000) : 0,
		{ source: status.source },
	)
}
