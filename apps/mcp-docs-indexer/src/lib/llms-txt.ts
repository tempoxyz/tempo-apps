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
		if (raw?.endsWith('.md')) addUrl(urls, raw, origin)
	}
	return [...urls]
}

function addUrl(urls: Set<string>, raw: string | undefined, origin: string) {
	if (!raw) return
	try {
		const u = new URL(raw, origin)
		if (u.origin !== origin) return
		u.hash = ''
		u.search = ''
		urls.add(u.toString())
	} catch {
		// skip invalid URLs
	}
}

/** `https://viem.sh/docs/foo` → `https://viem.sh/docs/foo.md`. */
export function toMarkdownUrl(pageUrl: string): string {
	const u = new URL(pageUrl)
	if (u.pathname.endsWith('.md')) return u.toString()
	u.pathname = `${u.pathname.replace(/\/$/, '')}.md`
	return u.toString()
}
