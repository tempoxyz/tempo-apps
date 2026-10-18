import { withTimeout } from './timeout.js'
import type { SyncReport } from './ingest.js'
import { isFailedSyncReport, workerMetrics } from './metrics.js'

/** Track confirmed readiness separately from successful uploads. */
export async function recordSourceFreshness(
	kv: KVNamespace,
	report: SyncReport,
	now = Date.now(),
): Promise<void> {
	const readyKey = `last_ready:${report.source}`
	const pendingKey = `pending_since:${report.source}`
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
