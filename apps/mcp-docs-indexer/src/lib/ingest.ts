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

	try {
		const indexUrl = sourceIndexUrl(source)
		const previousIndexUrl = await etagCache.get(sourceUrlKey)
		const sourceChanged =
			previousIndexUrl === null
				? new URL(source.base).pathname !== '/'
				: previousIndexUrl !== indexUrl
		const prevIndex = await loadIndex(etagCache, indexKey)
		const reconciled = await reconcilePendingItems({
			index: prevIndex,
			instance,
			etagCache,
			indexKey,
			cursorKey,
			sourceId: source.id,
		})
		const hasRetries = Object.values(prevIndex).some(
			(entry) => entry.index_retry,
		)
		const retryForce = (await etagCache.get(retryForceKey)) === '1'
		const prevSourceEtag =
			force || sourceChanged || hasRetries || retryForce
				? null
				: await etagCache.get(etagKey)
		const res = await fetch(indexUrl, {
			headers: {
				accept: MARKDOWN_ACCEPT,
				...(prevSourceEtag ? { 'If-None-Match': prevSourceEtag } : {}),
			},
			cf: { cacheTtl: 60 },
		})
		if (res.status === 304) {
			if (await etagCache.get(pendingDeletionKey)) {
				await etagCache.delete(pendingDeletionKey)
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

		const pageUrls = parseLlmsTxt(await res.text(), source.base)
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
		const pendingDeletion = await etagCache.get(pendingDeletionKey)
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
					await etagCache.put(pendingDeletionKey, `${Date.now()}:${signature}`)
				}
				return {
					source: source.id,
					status: 'pending_deletion',
					removed: removedKeys.length,
					duration_ms: elapsed(),
				}
			}
		} else if (pendingDeletion) {
			await etagCache.delete(pendingDeletionKey)
		}
		const metadataHash = await sha256(source.description ?? '')
		const next: SourceIndex = {}
		let pages = 0
		let unchanged = 0
		let failed = 0

		for (let i = 0; i < pageUrls.length; i += CONCURRENCY) {
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
					await instance.items.delete(entry.id)
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

		// Only advance ETag + persisted index after a fully clean sync. Otherwise
		// the next 304 on llms.txt would mask retries for failed pages, and a
		// partial index could re-delete items on the following run.
		if (failed === 0) {
			const etag = res.headers.get('etag')
			await etagCache.put(indexKey, JSON.stringify(next))
			await etagCache.put(sourceUrlKey, indexUrl)
			if (hasRemovals) await etagCache.delete(pendingDeletionKey)
			if (retryForce) await etagCache.delete(retryForceKey)
			if (etag) await etagCache.put(etagKey, etag)
		} else {
			await etagCache.put(retryForceKey, '1')
			await etagCache.delete(etagKey)
		}
		await etagCache.put(`last_sync:${source.id}`, new Date().toISOString())
		const pending = Object.values(next).filter(
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
}): Promise<{ pending: number }> {
	const { index, instance, etagCache, indexKey, cursorKey, sourceId } = args
	const pendingKeys = Object.keys(index).filter(
		(key) => index[key]?.index_pending,
	)
	if (pendingKeys.length === 0) return { pending: 0 }

	const cursor =
		Math.max(0, Number(await etagCache.get(cursorKey)) || 0) %
		pendingKeys.length
	const checks = Math.min(MAX_PENDING_CHECKS, pendingKeys.length)
	let changed = false
	for (let i = 0; i < checks; i++) {
		const key = pendingKeys[(cursor + i) % pendingKeys.length]
		const entry = index[key]
		let status: AiSearchItemInfo['status']
		let error: string | undefined
		try {
			const info = await instance.items.get(entry.id).info()
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
	if (changed) await etagCache.put(indexKey, JSON.stringify(index))
	if (pendingKeys.length > MAX_PENDING_CHECKS) {
		await etagCache.put(
			cursorKey,
			String((cursor + checks) % pendingKeys.length),
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
}): Promise<SyncPageResult> {
	const {
		url,
		source,
		instance,
		prevIndex,
		force,
		refreshMetadata,
		metadataHash,
	} = args
	const key = pageKey(url, source.id)
	const prev = prevIndex[key]

	try {
		const headers: Record<string, string> = { accept: MARKDOWN_ACCEPT }
		if (prev?.etag && !force && !prev.index_retry)
			headers['If-None-Match'] = prev.etag

		const res = await fetch(toMarkdownUrl(url), {
			headers,
			cf: { cacheTtl: 60 },
		})

		if (res.status === 304 && prev) {
			if (prev.index_retry) return { key, outcome: 'failed', entry: prev }
			return { key, outcome: 'unchanged', entry: prev }
		}
		if (!res.ok) {
			log.warn('page.fetch_failed', {
				source: source.id,
				url,
				status: res.status,
			})
			// Keep the old entry so the page is not treated as removed.
			return { key, outcome: 'failed', entry: prev }
		}
		const body = await res.text()
		if (isHtmlDocument(body, res.headers.get('content-type'))) {
			log.warn('page.html_response', { source: source.id, url })
			return { key, outcome: 'failed', entry: prev }
		}

		const content = normalizeDocsMarkdown(body)
		if (!content) {
			log.warn('page.empty', { source: source.id, url })
			return { key, outcome: 'failed', entry: prev }
		}
		const bytes = new TextEncoder().encode(content).byteLength
		if (bytes > MAX_PAGE_BYTES) {
			log.warn('page.too_large', {
				source: source.id,
				url,
				bytes,
			})
			return { key, outcome: 'failed', entry: prev }
		}
		const contentHash = await sha256(content)
		if (
			prev?.content_hash === contentHash &&
			prev.metadata_hash === metadataHash &&
			!refreshMetadata &&
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
		const item = await instance.items.upload(key, content, {
			metadata: {
				source: source.id,
				url,
				...(source.description
					? { source_description: source.description }
					: {}),
				...(title ? { title } : {}),
			},
		})
		if (item.status === 'error' || item.status === 'skipped') {
			log.warn('page.index_failed', {
				source: source.id,
				key,
				item_id: item.id,
				status: item.status,
				error: item.error,
			})
			return { key, outcome: 'failed', entry: prev }
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
				index_pending: item.status !== 'completed',
			},
		}
	} catch (err) {
		log.error('page.upload_failed', {
			source: source.id,
			url,
			error: err instanceof Error ? err.message : String(err),
		})
		return { key, outcome: 'failed', entry: prev }
	}
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
