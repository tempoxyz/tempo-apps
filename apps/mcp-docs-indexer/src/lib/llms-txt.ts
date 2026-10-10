import { resolveSourcePageUrl } from './sources.js'

/**
 * Parse an `llms.txt` (Vocs or vitepress-plugin-llms) into a list of absolute
 * same-origin page URLs.
 *
 * Links may be Markdown links, absolute URLs (`https://...`), or root-relative
 * Markdown paths (`/path.md`). Off-origin links and fragments are dropped.
 */
export function parseLlmsTxt(body: string, base: string): string[] {
	const urls = new Set<string>()
	if (new URL(base).hostname === 'tips.sh') {
		// Suffixed TIP revisions (`/1000-1`) are served only as HTML.
		for (const match of body.matchAll(/\bhref=["']\/(\d{4})["']/g)) {
			addUrl(urls, `/${match[1]}.md`, base)
		}
	}
	for (const m of body.matchAll(/\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)) {
		addUrl(urls, m[1], base)
	}
	for (const line of body.split('\n')) {
		const match = line.match(/^\s*[-*]\s+(https?:\/\/\S+|\/\S+)/)
		const raw = match?.[1]?.replace(/:$/, '')
		addUrl(urls, raw, base)
		const tip = line.match(/^\s*[-*]\s+\*\*TIP-(\d{4})\*\*:/)
		addUrl(urls, tip ? `/${tip[1]}.md` : undefined, base)
	}
	return [...urls]
}

function addUrl(urls: Set<string>, raw: string | undefined, base: string) {
	if (!raw) return
	const url = resolveSourcePageUrl(cleanRawUrl(raw), base)
	if (url && isLikelyDocsPage(url)) urls.add(url.toString())
}

function cleanRawUrl(raw: string): string {
	return raw.trim().replace(/[),.;:]+$/, '')
}

function isLikelyDocsPage(url: URL): boolean {
	const segment = url.pathname.split('/').pop() ?? ''
	const extension = segment.includes('.') ? segment.split('.').pop() : undefined
	return extension === undefined || extension === 'md'
}

/** `https://viem.sh/docs/foo` → `https://viem.sh/docs/foo.md`. */
export function toMarkdownUrl(pageUrl: string): string {
	const u = new URL(pageUrl)
	u.hash = ''
	u.search = ''
	const path = u.pathname.replace(/\/+$/, '')
	if (path === '') u.pathname = '/index.md'
	else if (path.endsWith('.md')) u.pathname = path
	else u.pathname = `${path}.md`
	return u.toString()
}
