/**
 * Parse an `llms.txt` (Vocs or vitepress-plugin-llms) into a list of absolute
 * same-origin page URLs.
 *
 * Links may be absolute (`https://...`) or root-relative (`/path`). Off-origin
 * links and fragments are dropped.
 */
export function parseLlmsTxt(body: string, base: string): string[] {
	const origin = new URL(base).origin
	const urls = new Set<string>()
	for (const m of body.matchAll(/\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)) {
		try {
			const u = new URL(m[1]!, origin)
			if (u.origin !== origin) continue
			u.hash = ''
			u.search = ''
			urls.add(u.toString())
		} catch {
			// skip invalid URLs
		}
	}
	return [...urls]
}

/** `https://viem.sh/docs/foo` → `https://viem.sh/docs/foo.md`. */
export function toMarkdownUrl(pageUrl: string): string {
	const u = new URL(pageUrl)
	u.pathname = `${u.pathname.replace(/\/$/, '')}.md`
	return u.toString()
}
