import { log } from './log.js'
import { parseLlmsTxt, toMarkdownUrl } from './llms-txt.js'
import type { Source } from './sources.js'

export type SyncReport =
	| { source: string; status: 'unchanged'; duration_ms: number }
	| {
			source: string
			status: 'synced'
			pages: number
			failed: number
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
}): Promise<SyncReport> {
	const { source, instance, etagCache } = args
	const etagKey = `etag:${source.id}`
	const startedAt = performance.now()
	const elapsed = () => Math.round(performance.now() - startedAt)

	try {
		const prev = await etagCache.get(etagKey)
		const res = await fetch(`${source.base}/llms.txt`, {
			headers: prev ? { 'If-None-Match': prev } : {},
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
		let pages = 0
		let failed = 0
		for (let i = 0; i < pageUrls.length; i += CONCURRENCY) {
			const batch = pageUrls.slice(i, i + CONCURRENCY)
			const results = await Promise.allSettled(
				batch.map((url) => uploadPage(url, source, instance)),
			)
			for (const r of results) {
				if (r.status === 'fulfilled' && r.value) pages++
				else failed++
			}
		}

		const etag = res.headers.get('etag')
		if (etag) await etagCache.put(etagKey, etag)
		await etagCache.put(`last_sync:${source.id}`, new Date().toISOString())
		return {
			source: source.id,
			status: 'synced',
			pages,
			failed,
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

async function uploadPage(
	pageUrl: string,
	source: Source,
	instance: AiSearchInstance,
): Promise<boolean> {
	try {
		const res = await fetch(toMarkdownUrl(pageUrl), { cf: { cacheTtl: 60 } })
		if (!res.ok) {
			log.warn('page.fetch_failed', {
				source: source.id,
				url: pageUrl,
				status: res.status,
			})
			return false
		}
		const content = await res.text()
		if (!content) {
			log.warn('page.empty', { source: source.id, url: pageUrl })
			return false
		}
		if (content.length > MAX_PAGE_BYTES) {
			log.warn('page.too_large', {
				source: source.id,
				url: pageUrl,
				bytes: content.length,
			})
			return false
		}
		const path = new URL(pageUrl).pathname.replace(/^\/+|\/+$/g, '') || 'index'
		const key = `${source.id}/${path.replace(/\//g, '_')}.md`
		await instance.items.uploadAndPoll(key, content, {
			metadata: { source: source.id, url: pageUrl },
		})
		return true
	} catch (err) {
		log.error('page.upload_failed', {
			source: source.id,
			url: pageUrl,
			error: err instanceof Error ? err.message : String(err),
		})
		return false
	}
}
