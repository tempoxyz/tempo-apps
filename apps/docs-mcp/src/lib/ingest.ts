import { parseLlmsTxt, toMarkdownUrl } from './llms-txt.js'
import type { Source } from './sources.js'

export type SyncReport =
	| { source: string; status: 'unchanged' }
	| { source: string; status: 'synced'; pages: number }
	| { source: string; status: 'error'; error: string }

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

	try {
		const prev = await etagCache.get(etagKey)
		const res = await fetch(`${source.base}/llms.txt`, {
			headers: prev ? { 'If-None-Match': prev } : {},
			cf: { cacheTtl: 60 },
		})
		if (res.status === 304) return { source: source.id, status: 'unchanged' }
		if (!res.ok) {
			return {
				source: source.id,
				status: 'error',
				error: `index ${res.status}`,
			}
		}

		const pageUrls = parseLlmsTxt(await res.text(), source.base)
		let pages = 0
		for (let i = 0; i < pageUrls.length; i += CONCURRENCY) {
			const batch = pageUrls.slice(i, i + CONCURRENCY)
			const results = await Promise.allSettled(
				batch.map((url) => uploadPage(url, source, instance)),
			)
			pages += results.filter((r) => r.status === 'fulfilled' && r.value).length
		}

		const etag = res.headers.get('etag')
		if (etag) await etagCache.put(etagKey, etag)
		await etagCache.put(`last_sync:${source.id}`, new Date().toISOString())
		return { source: source.id, status: 'synced', pages }
	} catch (err) {
		return {
			source: source.id,
			status: 'error',
			error: err instanceof Error ? err.message : String(err),
		}
	}
}

async function uploadPage(
	pageUrl: string,
	source: Source,
	instance: AiSearchInstance,
): Promise<boolean> {
	const res = await fetch(toMarkdownUrl(pageUrl), { cf: { cacheTtl: 60 } })
	if (!res.ok) return false
	const content = await res.text()
	if (!content || content.length > MAX_PAGE_BYTES) return false
	const path = new URL(pageUrl).pathname.replace(/^\/+|\/+$/g, '') || 'index'
	const key = `${source.id}/${path.replace(/\//g, '_')}.md`
	await instance.items.uploadAndPoll(key, content, {
		metadata: { source: source.id, url: pageUrl },
	})
	return true
}
