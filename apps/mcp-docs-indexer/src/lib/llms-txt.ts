/**
 * Parse an `llms.txt` (Vocs or vitepress-plugin-llms) into a list of absolute
 * same-origin page URLs.
 *
 * Links may be Markdown links, absolute URLs (`https://...`), or root-relative
 * Markdown paths (`/path.md`). Off-origin links and fragments are dropped.
 */
export function parseLlmsTxt(body: string, base: string): string[] {
	const origin = new URL(base).origin
	const urls = new Set<string>()
	for (const m of body.matchAll(/\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)) {
		addUrl(urls, m[1], origin)
	}
	for (const line of body.split('\n')) {
		const match = line.match(/^\s*[-*]\s+(https?:\/\/\S+|\/\S+)/)
		const raw = match?.[1]?.replace(/:$/, '')
		addUrl(urls, raw, origin)
		const tip = line.match(/^\s*[-*]\s+\*\*TIP-(\d{4}(?:-\d+)?)\*\*:/)
		addUrl(urls, tip ? `/${tip[1]}.md` : undefined, origin)
	}
	return [...urls]
}

function addUrl(urls: Set<string>, raw: string | undefined, origin: string) {
	if (!raw) return
	try {
		const u = new URL(cleanRawUrl(raw), origin)
		if (u.origin !== origin) return
		u.hash = ''
		u.search = ''
		if (!isLikelyDocsPage(u)) return
		urls.add(u.toString())
	} catch {
		// skip invalid URLs
	}
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
