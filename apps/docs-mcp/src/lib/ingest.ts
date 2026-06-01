import { log } from './log.js'
import { parseLlmsTxt, toMarkdownUrl } from './llms-txt.js'
import type { Source } from './sources.js'

/** Recorded state for one AI Search item, persisted to KV per source. */
type IndexEntry = { id: string; etag?: string }
/** Per-source map of AI Search item key → {item id, last-seen ETag}. */
type SourceIndex = Record<string, IndexEntry>

export type SyncReport =
	| { source: string; status: 'unchanged'; duration_ms: number }
	| {
			source: string
			status: 'synced'
			pages: number
			unchanged: number
			failed: number
			deleted: number
			duration_ms: number
	  }
	| { source: string; status: 'error'; error: string; duration_ms: number }

/** Concurrent page fetches per source. Tuned to stay well under Workers' 50-subrequest budget. */
const CONCURRENCY = 8
/** Skip pages larger than AI Search's 4MB per-file cap (with margin). */
const MAX_PAGE_BYTES = 3_500_000

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
	const startedAt = performance.now()
	const elapsed = () => Math.round(performance.now() - startedAt)

	try {
		const prevSourceEtag = force ? null : await etagCache.get(etagKey)
		const res = await fetch(`${source.base}/llms.txt`, {
			headers: prevSourceEtag ? { 'If-None-Match': prevSourceEtag } : {},
			cf: { cacheTtl: 60 },
		})
		if (res.status === 304) {
			return { source: source.id, status: 'unchanged', duration_ms: elapsed() }
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
		const prevIndex = await loadIndex(etagCache, indexKey)
		const next: SourceIndex = {}
		let pages = 0
		let unchanged = 0
		let failed = 0

		for (let i = 0; i < pageUrls.length; i += CONCURRENCY) {
			const batch = pageUrls.slice(i, i + CONCURRENCY)
			const results = await Promise.allSettled(
				batch.map((url) =>
					syncPage({ url, source, instance, prevIndex, force }),
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
			if (etag) await etagCache.put(etagKey, etag)
			await etagCache.put(indexKey, JSON.stringify(next))
		}
		await etagCache.put(`last_sync:${source.id}`, new Date().toISOString())
		return {
			source: source.id,
			status: 'synced',
			pages,
			unchanged,
			failed,
			deleted,
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
}): Promise<SyncPageResult> {
	const { url, source, instance, prevIndex, force } = args
	const key = pageKey(url, source.id)
	const prev = prevIndex[key]

	try {
		const headers: Record<string, string> = {}
		if (prev?.etag && !force) headers['If-None-Match'] = prev.etag

		const res = await fetch(toMarkdownUrl(url), {
			headers,
			cf: { cacheTtl: 60 },
		})

		if (res.status === 304 && prev) {
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

		const content = await res.text()
		if (!content) {
			log.warn('page.empty', { source: source.id, url })
			return { key, outcome: 'failed', entry: prev }
		}
		if (content.length > MAX_PAGE_BYTES) {
			log.warn('page.too_large', {
				source: source.id,
				url,
				bytes: content.length,
			})
			return { key, outcome: 'failed', entry: prev }
		}

		const item = await instance.items.uploadAndPoll(key, content, {
			metadata: { source: source.id, url },
		})
		const etag = res.headers.get('etag') ?? undefined
		return {
			key,
			outcome: 'uploaded',
			entry: { id: item.id, etag },
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

/** Derive a stable AI Search item key from a page URL and source id. */
function pageKey(url: string, sourceId: string): string {
	const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '') || 'index'
	return `${sourceId}/${path.replace(/\//g, '_')}.md`
}
