import { withTimeout } from './timeout.js'
import { log } from './log.js'
import { parseLlmsTxt, toMarkdownUrl } from './llms-txt.js'
import {
	isHtmlDocument,
	MARKDOWN_ACCEPT,
	normalizeDocsMarkdown,
} from './markdown.js'
import type { Source } from './sources.js'
import { sourceIndexUrl } from './sources.js'

/** Recorded state for one AI Search item, persisted to KV per source. */
type IndexEntry = {
	id: string
	etag?: string
	content_hash?: string
	metadata_hash?: string
	index_pending?: boolean
	index_retry?: boolean
	source_url?: string
}
/** Per-source map of AI Search item key → {item id, last-seen ETag}. */
type SourceIndex = Record<string, IndexEntry>

export type SyncReport =
	| { source: string; status: 'unchanged'; duration_ms: number }
	| {
			source: string
			status: 'pending_deletion'
			removed: number
			duration_ms: number
	  }
	| {
			source: string
			status: 'synced' | 'pending_index'
			pages: number
			unchanged: number
			failed: number
			deleted: number
			pending: number
			duration_ms: number
	  }
	| { source: string; status: 'error'; error: string; duration_ms: number }

/** Concurrent page fetches per source. Tuned to stay well under Workers' 50-subrequest budget. */
const CONCURRENCY = 8
/** Skip pages larger than AI Search's 4MB per-file cap (with margin). */
const MAX_PAGE_BYTES = 3_500_000
const DELETION_CONFIRMATION_MS = 5 * 60_000
const MAX_PENDING_CHECKS = 20
const CALL_TIMEOUT_MS = 15_000
const SOURCE_TIMEOUT_MS = 90_000
type IngestCall = <T>(
	operation: (signal: AbortSignal) => Promise<T>,
) => Promise<T>

export async function syncSource(args: {
	source: Source
	instance: AiSearchInstance
	etagCache: KVNamespace
	/** When true, bypass both the per-source and per-page ETag caches. */
	force?: boolean
}): Promise<SyncReport> {
	const { source, instance, etagCache, force = false } = args
	const indexKey = `index:${source.id}`
	const etagKey = `etag:${source.id}`
	const sourceUrlKey = `source_url:${source.id}`
	const pendingDeletionKey = `pending_deletion:${source.id}`
	const retryForceKey = `retry_force:${source.id}`
	const cursorKey = `index_cursor:${source.id}`
	const startedAt = performance.now()
	const elapsed = () => Math.round(performance.now() - startedAt)
	const controller = new AbortController()
	const timer = setTimeout(
		() => controller.abort(new Error('Source sync timed out')),
		SOURCE_TIMEOUT_MS,
	)
	const call: IngestCall = (operation) =>
		withTimeout(operation, CALL_TIMEOUT_MS, controller.signal)

	try {
		const indexUrl = sourceIndexUrl(source)
		const previousIndexUrl = await call(() => etagCache.get(sourceUrlKey))
		const sourceChanged =
			previousIndexUrl === null
				? new URL(source.base).pathname !== '/'
				: previousIndexUrl !== indexUrl
		const prevIndex = await call(() => loadIndex(etagCache, indexKey))
		const reconciled = await reconcilePendingItems({
			index: prevIndex,
			instance,
			etagCache,
			indexKey,
			cursorKey,
			sourceId: source.id,
			call,
		})
		const hasRetries = Object.values(prevIndex).some(
			(entry) => entry.index_retry,
		)
		const retryForce = (await call(() => etagCache.get(retryForceKey))) === '1'
		const prevSourceEtag =
			force || sourceChanged || hasRetries || retryForce
				? null
				: await call(() => etagCache.get(etagKey))
		const { res, body } = await call(async (signal) => {
			const res = await fetch(indexUrl, {
				signal,
				headers: {
					accept: MARKDOWN_ACCEPT,
					...(prevSourceEtag ? { 'If-None-Match': prevSourceEtag } : {}),
				},
				cf: { cacheTtl: 60 },
			})
			return { res, body: res.ok ? await res.text() : '' }
		})
		if (res.status === 304) {
			if (await call(() => etagCache.get(pendingDeletionKey))) {
				await call(() => etagCache.delete(pendingDeletionKey))
			}
			if ((hasRetries || retryForce) && reconciled.pending === 0) {
				return {
					source: source.id,
					status: 'error',
					error: 'index returned 304 during retry',
					duration_ms: elapsed(),
				}
			}
			return reconciled.pending > 0
				? {
						source: source.id,
						status: 'pending_index',
						pages: 0,
						unchanged: 0,
						failed: 0,
						deleted: 0,
						pending: reconciled.pending,
						duration_ms: elapsed(),
					}
				: { source: source.id, status: 'unchanged', duration_ms: elapsed() }
		}
		if (!res.ok) {
			return {
				source: source.id,
				status: 'error',
				error: `index ${res.status}`,
				duration_ms: elapsed(),
			}
		}

		const pageUrls = parseLlmsTxt(body, source.base)
		if (pageUrls.length === 0) {
			return {
				source: source.id,
				status: 'error',
				error: 'index contains no documentation pages',
				duration_ms: elapsed(),
			}
		}
		const intendedKeys = new Set(pageUrls.map((url) => pageKey(url, source.id)))
		const removedKeys = Object.keys(prevIndex)
			.filter((key) => !intendedKeys.has(key))
			.sort()
		const hasRemovals = removedKeys.length > 0
		const pendingDeletion = await call(() => etagCache.get(pendingDeletionKey))
		if (hasRemovals && !sourceChanged) {
			const signature = await sha256(removedKeys.join('\n'))
			const [observedAt, previousSignature] = pendingDeletion?.split(':') ?? []
			const observedAtMs = Number(observedAt)
			if (
				previousSignature !== signature ||
				!Number.isFinite(observedAtMs) ||
				Date.now() - observedAtMs < DELETION_CONFIRMATION_MS
			) {
				if (previousSignature !== signature || !Number.isFinite(observedAtMs)) {
					await call(() =>
						etagCache.put(pendingDeletionKey, `${Date.now()}:${signature}`),
					)
				}
				return {
					source: source.id,
					status: 'pending_deletion',
					removed: removedKeys.length,
					duration_ms: elapsed(),
				}
			}
		} else if (pendingDeletion) {
			await call(() => etagCache.delete(pendingDeletionKey))
		}
		const metadataHash = await sha256(source.description ?? '')
		const next: SourceIndex = {}
		let pages = 0
		let unchanged = 0
		let failed = 0

		for (let i = 0; i < pageUrls.length; i += CONCURRENCY) {
			if (controller.signal.aborted) {
				failed += pageUrls.length - i
				break
			}
			const batch = pageUrls.slice(i, i + CONCURRENCY)
			const results = await Promise.allSettled(
				batch.map((url) =>
					syncPage({
						url,
						source,
						instance,
						prevIndex,
						force: force || sourceChanged || retryForce,
						refreshMetadata: sourceChanged,
						metadataHash,
						call,
					}),
				),
			)
			for (const r of results) {
				if (r.status !== 'fulfilled') {
					failed++
					continue
				}
				const out = r.value
				if (out.entry) next[out.key] = out.entry
				if (out.outcome === 'uploaded') pages++
				else if (out.outcome === 'unchanged') unchanged++
				else failed++
			}
		}

		// Delete items that disappeared from llms.txt. Only safe to run when
		// every intended page was accounted for — otherwise a transient page
		// failure would look like a removal.
		let deleted = 0
		if (failed === 0) {
			for (const [key, entry] of Object.entries(prevIndex)) {
				if (next[key]) continue
				try {
					await call(() => instance.items.delete(entry.id))
					deleted++
				} catch (err) {
					// An already-missing item satisfies the stale-page deletion.
					if (
						err instanceof Error &&
						(err.message === 'item_not_found' ||
							err.message === 'AiSearchNotFoundError: item_not_found')
					) {
						deleted++
						continue
					}
					log.warn('page.delete_failed', {
						source: source.id,
						key,
						item_id: entry.id,
						error: err instanceof Error ? err.message : String(err),
					})
					failed++
				}
			}
		}

		// Reserve a bounded persistence phase even if the source deadline expired.
		const save: IngestCall = (operation) => withTimeout(operation, 5000)
		// Advance the source ETag only after a clean sync. Preserve successful
		// uploads on partial runs without dropping stale entries awaiting deletion.
		const savedIndex = failed === 0 ? next : { ...prevIndex, ...next }
		if (failed === 0) {
			const etag = res.headers.get('etag')
			await save(() => etagCache.put(indexKey, JSON.stringify(next)))
			await save(() => etagCache.put(sourceUrlKey, indexUrl))
			if (hasRemovals) await save(() => etagCache.delete(pendingDeletionKey))
			if (retryForce) await save(() => etagCache.delete(retryForceKey))
			if (etag) await save(() => etagCache.put(etagKey, etag))
		} else {
			await save(() => etagCache.put(indexKey, JSON.stringify(savedIndex)))
			await save(() => etagCache.put(retryForceKey, '1'))
			await save(() => etagCache.delete(etagKey))
		}
		await save(() =>
			etagCache.put(`last_sync:${source.id}`, new Date().toISOString()),
		)
		const pending = Object.values(savedIndex).filter(
			(entry) => entry.index_pending,
		).length
		return {
			source: source.id,
			status: pending > 0 ? 'pending_index' : 'synced',
			pages,
			unchanged,
			failed,
			deleted,
			pending,
			duration_ms: elapsed(),
		}
	} catch (err) {
		return {
			source: source.id,
			status: 'error',
			error: err instanceof Error ? err.message : String(err),
			duration_ms: elapsed(),
		}
	} finally {
		clearTimeout(timer)
	}
}

async function loadIndex(kv: KVNamespace, key: string): Promise<SourceIndex> {
	const raw = await kv.get(key)
	if (!raw) return {}
	try {
		const parsed = JSON.parse(raw) as unknown
		if (parsed && typeof parsed === 'object') return parsed as SourceIndex
	} catch (err) {
		log.warn('index.parse_failed', {
			key,
			error: err instanceof Error ? err.message : String(err),
		})
	}
	return {}
}

async function reconcilePendingItems(args: {
	index: SourceIndex
	instance: AiSearchInstance
	etagCache: KVNamespace
	indexKey: string
	cursorKey: string
	sourceId: string
	call: IngestCall
}): Promise<{ pending: number }> {
	const { index, instance, etagCache, indexKey, cursorKey, sourceId, call } =
		args
	const pendingKeys = Object.keys(index).filter(
		(key) => index[key]?.index_pending,
	)
	if (pendingKeys.length === 0) return { pending: 0 }

	const cursor =
		Math.max(0, Number(await call(() => etagCache.get(cursorKey))) || 0) %
		pendingKeys.length
	const checks = Math.min(MAX_PENDING_CHECKS, pendingKeys.length)
	let changed = false
	for (let i = 0; i < checks; i++) {
		const key = pendingKeys[(cursor + i) % pendingKeys.length]
		const entry = index[key]
		let status: AiSearchItemInfo['status']
		let error: string | undefined
		try {
			const info = await call(() => instance.items.get(entry.id).info())
			status = info.status
			error = info.error
		} catch (err) {
			if (!(err instanceof Error) || !err.message.includes('item_not_found'))
				throw err
			status = 'error'
			error = err.message
		}
		if (status === 'completed') {
			index[key] = { ...entry, index_pending: false }
			changed = true
		} else if (
			status === 'error' ||
			status === 'skipped' ||
			status === 'outdated'
		) {
			index[key] = { ...entry, index_pending: false, index_retry: true }
			changed = true
			log.warn('page.index_failed', {
				source: sourceId,
				key,
				item_id: entry.id,
				status,
				error,
			})
		}
	}
	if (changed) await call(() => etagCache.put(indexKey, JSON.stringify(index)))
	if (pendingKeys.length > MAX_PENDING_CHECKS) {
		await call(() =>
			etagCache.put(cursorKey, String((cursor + checks) % pendingKeys.length)),
		)
	}
	return {
		pending: Object.values(index).filter((entry) => entry.index_pending).length,
	}
}

type PageOutcome = 'uploaded' | 'unchanged' | 'failed'
type SyncPageResult = {
	key: string
	outcome: PageOutcome
	/** Entry to record for next sync. Undefined for hard failures. */
	entry?: IndexEntry
}

async function syncPage(args: {
	url: string
	source: Source
	instance: AiSearchInstance
	prevIndex: SourceIndex
	force: boolean
	refreshMetadata: boolean
	metadataHash: string
	call: IngestCall
}): Promise<SyncPageResult> {
	const {
		url,
		source,
		instance,
		prevIndex,
		force,
		refreshMetadata,
		metadataHash,
		call,
	} = args
	const key = pageKey(url, source.id)
	const prev = prevIndex[key]
	const retryEntry = prev ? { ...prev, index_retry: true } : undefined

	try {
		const headers: Record<string, string> = { accept: MARKDOWN_ACCEPT }
		if (prev?.etag && !force && !prev.index_retry)
			headers['If-None-Match'] = prev.etag

		const { res, body } = await call(async (signal) => {
			const res = await fetch(toMarkdownUrl(url), {
				headers,
				cf: { cacheTtl: 60 },
				signal,
			})
			return { res, body: res.ok ? await res.text() : '' }
		})

		if (res.status === 304 && prev) {
			if (prev.index_retry) return { key, outcome: 'failed', entry: retryEntry }
			return { key, outcome: 'unchanged', entry: prev }
		}
		if (!res.ok) {
			log.warn('page.fetch_failed', {
				source: source.id,
				url,
				status: res.status,
			})
			// Keep the old entry so the page is not treated as removed.
			return { key, outcome: 'failed', entry: retryEntry }
		}
		if (isHtmlDocument(body, res.headers.get('content-type'))) {
			log.warn('page.html_response', { source: source.id, url })
			return { key, outcome: 'failed', entry: retryEntry }
		}

		const content = normalizeDocsMarkdown(body)
		if (!content) {
			log.warn('page.empty', { source: source.id, url })
			return { key, outcome: 'failed', entry: retryEntry }
		}
		const bytes = new TextEncoder().encode(content).byteLength
		if (bytes > MAX_PAGE_BYTES) {
			log.warn('page.too_large', {
				source: source.id,
				url,
				bytes,
			})
			return { key, outcome: 'failed', entry: retryEntry }
		}
		const contentHash = await sha256(content)
		if (
			prev?.content_hash === contentHash &&
			prev.metadata_hash === metadataHash &&
			(!refreshMetadata || prev.source_url === sourceIndexUrl(source)) &&
			!prev.index_retry
		) {
			const etag = res.headers.get('etag') ?? prev.etag
			return {
				key,
				outcome: 'unchanged',
				entry: {
					...prev,
					...(etag ? { etag } : {}),
					content_hash: contentHash,
				},
			}
		}

		const title = extractTitle(content)

		// Use upload() not uploadAndPoll(): we don't need to block on indexing
		// completion (AI Search indexes in the background). Polling per page
		// serializes with our 8-way concurrency and trips the internal poll
		// timeout, causing whole batches to fail.
		const item = await call(() =>
			instance.items.upload(key, content, {
				metadata: {
					source: source.id,
					url,
					...(source.description
						? { source_description: source.description }
						: {}),
					...(title ? { title } : {}),
				},
			}),
		)
		if (item.status === 'error' || item.status === 'skipped') {
			log.warn('page.index_failed', {
				source: source.id,
				key,
				item_id: item.id,
				status: item.status,
				error: item.error,
			})
			return { key, outcome: 'failed', entry: retryEntry }
		}
		const etag = res.headers.get('etag') ?? undefined
		return {
			key,
			outcome: 'uploaded',
			entry: {
				id: item.id,
				etag,
				content_hash: contentHash,
				metadata_hash: metadataHash,
				source_url: sourceIndexUrl(source),
				index_pending: item.status !== 'completed',
			},
		}
	} catch (err) {
		log.error('page.upload_failed', {
			source: source.id,
			url,
			error: err instanceof Error ? err.message : String(err),
		})
		return { key, outcome: 'failed', entry: retryEntry }
	}
}

/** Indexing states reported by AI Search for uploaded items. */
export const ITEM_STATUSES = [
	'completed',
	'queued',
	'running',
	'error',
	'skipped',
	'outdated',
] as const

export type SourceIndexStatus = {
	source: string
	counts: Partial<Record<(typeof ITEM_STATUSES)[number], number>>
	/** First indexing error AI Search reports for the source, if any. */
	sample_error?: string
}

/**
 * Count a source's uploaded items by AI Search indexing state. A source can
 * sync cleanly while AI Search never makes its items searchable; these counts
 * make that visible in logs and metrics.
 */
export async function sourceIndexStatus(
	instance: AiSearchInstance,
	sourceId: string,
): Promise<SourceIndexStatus> {
	const metadataFilter = JSON.stringify({ source: sourceId })
	const status: SourceIndexStatus = { source: sourceId, counts: {} }
	await Promise.all(
		ITEM_STATUSES.map(async (itemStatus) => {
			try {
				const response = await withTimeout(
					() =>
						instance.items.list({
							status: itemStatus,
							metadata_filter: metadataFilter,
							per_page: 1,
						}),
					CALL_TIMEOUT_MS,
				)
				const count = response.result_info?.total_count
				if (typeof count !== 'number')
					throw new Error('item listing missing total_count')
				status.counts[itemStatus] = count
				if (itemStatus === 'error' && response.result[0]?.error) {
					status.sample_error = response.result[0].error
				}
			} catch (err) {
				log.warn('source.index_status_failed', {
					source: sourceId,
					status: itemStatus,
					error: err instanceof Error ? err.message : String(err),
				})
			}
		}),
	)
	return status
}

async function sha256(content: string): Promise<string> {
	const bytes = new TextEncoder().encode(content)
	const digest = await crypto.subtle.digest('SHA-256', bytes)
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
}

/** First markdown H1 (`# Title`) becomes the canonical page title. */
function extractTitle(content: string): string | undefined {
	for (const line of content.split('\n')) {
		const match = /^#\s+(.+?)\s*$/.exec(line.trim())
		if (match) return match[1]
	}
	return undefined
}

/** Derive a stable AI Search item key from a page URL and source id. */
function pageKey(url: string, sourceId: string): string {
	const path = new URL(toMarkdownUrl(url)).pathname.replace(/^\/+|\/+$/g, '')
	return `${sourceId}/${path}`
}
