/**
 * Parse a Vocs / vitepress-plugin-llms `llms.txt` file into a list of
 * absolute page URLs scoped to a base origin.
 *
 * llms.txt format example:
 *   # Tempo Docs
 *   > Documentation for Tempo
 *
 *   ## Quickstart
 *   - [Integrate Tempo](https://docs.tempo.xyz/quickstart/integrate-tempo): one-liner
 *   - [Faucet](/quickstart/faucet): description
 *
 * Links may be absolute (https://...) or root-relative (/path). We accept
 * both, normalize to absolute URLs, and drop any link that points off-origin.
 */
export function parseLlmsTxt(body: string, base: string): string[] {
	const baseOrigin = new URL(base).origin
	const urls = new Set<string>()

	for (const match of body.matchAll(/\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)) {
		const raw = match[1]
		if (!raw) continue
		let url: URL
		try {
			url = new URL(raw, baseOrigin)
		} catch {
			continue
		}
		if (url.origin !== baseOrigin) continue
		// Drop fragments and queries — we want the canonical page.
		url.hash = ''
		url.search = ''
		urls.add(url.toString())
	}

	return [...urls]
}

/**
 * Convert a page URL like `https://viem.sh/docs/getting-started` to its
 * raw-Markdown variant `https://viem.sh/docs/getting-started.md`. Vocs and
 * vitepress-plugin-llms both serve this for every page.
 */
export function toMarkdownUrl(pageUrl: string): string {
	const u = new URL(pageUrl)
	// Strip trailing slash, then append .md
	u.pathname = `${u.pathname.replace(/\/$/, '')}.md`
	return u.toString()
}
