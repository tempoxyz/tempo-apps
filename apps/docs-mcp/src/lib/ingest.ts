import { parseLlmsTxt, toMarkdownUrl } from './llms-txt.js'
import type { Source } from './sources.js'

export type SyncReport = {
	source: string
	status: 'unchanged' | 'synced' | 'error'
	pages_indexed?: number
	pages_failed?: number
	error?: string
}

/** Cap on parallel page fetches per source to stay within fetch subrequest budgets. */
const CONCURRENCY = 8
/** Skip any page Markdown larger than ~3.5MB — AI Search's per-file cap is 4MB. */
const MAX_PAGE_BYTES = 3_500_000

export async function syncSource(args: {
	source: Source
	aiSearch: AiSearchNamespace
	instanceId: string
	etagCache: KVNamespace
}): Promise<SyncReport> {
	const { source, aiSearch, instanceId, etagCache } = args
	const etagKey = `etag:${source.id}`

	try {
		const prevEtag = await etagCache.get(etagKey)
		const indexUrl = `${source.base}/llms.txt`
		const indexRes = await fetch(indexUrl, {
			headers: prevEtag ? { 'If-None-Match': prevEtag } : {},
			cf: { cacheTtl: 60 },
		})

		if (indexRes.status === 304) {
			return { source: source.id, status: 'unchanged' }
		}
		if (!indexRes.ok) {
			return {
				source: source.id,
				status: 'error',
				error: `index fetch ${indexRes.status}`,
			}
		}

		const newEtag = indexRes.headers.get('etag') ?? ''
		const body = await indexRes.text()
		const pageUrls = parseLlmsTxt(body, source.base)

		const instance = aiSearch.get(instanceId)
		let indexed = 0
		let failed = 0

		// Simple semaphore via batches.
		for (let i = 0; i < pageUrls.length; i += CONCURRENCY) {
			const batch = pageUrls.slice(i, i + CONCURRENCY)
			const results = await Promise.allSettled(
				batch.map((pageUrl) => uploadOne({ pageUrl, source, instance })),
			)
			for (const r of results) {
				if (r.status === 'fulfilled' && r.value === 'uploaded') indexed++
				else if (r.status === 'fulfilled' && r.value === 'skipped') {
					// no-op
				} else failed++
			}
		}

		if (newEtag) await etagCache.put(etagKey, newEtag)
		await etagCache.put(`last_sync:${source.id}`, new Date().toISOString())

		return {
			source: source.id,
			status: 'synced',
			pages_indexed: indexed,
			pages_failed: failed,
		}
	} catch (err) {
		return {
			source: source.id,
			status: 'error',
			error: err instanceof Error ? err.message : String(err),
		}
	}
}

async function uploadOne(args: {
	pageUrl: string
	source: Source
	instance: AiSearchInstance
}): Promise<'uploaded' | 'skipped'> {
	const { pageUrl, source, instance } = args
	const mdUrl = toMarkdownUrl(pageUrl)
	const res = await fetch(mdUrl, { cf: { cacheTtl: 60 } })
	if (!res.ok) return 'skipped'

	const content = await res.text()
	if (content.length === 0) return 'skipped'
	if (content.length > MAX_PAGE_BYTES) return 'skipped'

	const path = new URL(pageUrl).pathname.replace(/^\/+|\/+$/g, '') || 'index'
	const key = `${source.id}/${path.replace(/\//g, '_')}.md`
	const title = extractTitle(content) ?? path

	await instance.items.uploadAndPoll(key, content, {
		metadata: {
			source: source.id,
			source_description: source.description,
			url: pageUrl,
			title,
			fetched_at: new Date().toISOString(),
		},
	})
	return 'uploaded'
}

function extractTitle(markdown: string): string | undefined {
	// Try YAML frontmatter `title:` first.
	const fm = markdown.match(/^---\n([\s\S]*?)\n---/)
	if (fm?.[1]) {
		const t = fm[1].match(/^title:\s*(.+)$/m)
		if (t?.[1]) return t[1].trim().replace(/^["']|["']$/g, '')
	}
	// Fall back to first H1.
	const h1 = markdown.match(/^#\s+(.+)$/m)
	if (h1?.[1]) return h1[1].trim()
	return undefined
}
