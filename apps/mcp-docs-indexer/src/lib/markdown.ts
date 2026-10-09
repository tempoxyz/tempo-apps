/**
 * Accept header for docs fetches. Some sites (tips.sh) negotiate on it and
 * return HTML to clients that do not ask for Markdown.
 */
export const MARKDOWN_ACCEPT = 'text/markdown, text/plain;q=0.9, */*;q=0.1'

/** Lines of docs UI chrome that some sites leak into their Markdown exports. */
const CHROME_LINE_PATTERNS = [
	/^skip to content$/i,
	/^\[skip to content\]\(/i,
	/^search\.\.\.$/i,
	/^\[\]\(\/\)$/i,
	/^⌘$/i,
	/^k$/i,
	/^i$/i,
	/^was this helpful\?$/i,
	/^copy page for ai$/i,
	/^ask ai\.\.\.$/i,
	/^suggest changes to this page$/i,
	// Empty anchors kept from MDX sources to preserve old deep links.
	/^<span id="[^"]*"\s*\/>$/i,
]

/**
 * Generated breadcrumb that Tempo docs prepend to every Markdown page. The
 * marker and notice text come from `renderAiPage` and `aiDocsNotice` in
 * tempoxyz/docs `src/lib/ai-docs.ts`; update these patterns if they change.
 */
const TEMPO_CONTEXT_MARKER = '<!-- tempo-docs-context -->'

/** Breadcrumb lines worth keeping because they change how a page should be read. */
const KEPT_CONTEXT_LINE = /^>\s*Earlier testnet sandbox:/i

/** `> Section: [Accounts](/docs/accounts.md). Long description.` */
const SECTION_CONTEXT_LINE = /^>\s*Section:\s*\[([^\]]+)\]/i

/**
 * Blockquotes that point agents at an MCP server. They repeat on every page,
 * so indexing them spends retrieval budget on boilerplate instead of docs.
 */
const AGENT_NOTICE_START = [
	/^>\s*Tempo MCP:/i,
	/^>\s*\*\*Can't find what you're looking for\?\*\*/i,
]

/**
 * Normalize a docs Markdown export before it is indexed or returned to an MCP
 * client: drop sitemap comments, agent notices, and docs UI chrome.
 */
export function normalizeDocsMarkdown(text: string): string {
	return stripAgentNotices(stripSitemapComment(text).split('\n'))
		.map((line) => line.trimEnd())
		.filter(
			(line) =>
				!CHROME_LINE_PATTERNS.some((pattern) => pattern.test(line.trim())),
		)
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

/** True when a docs page fetch returned an HTML document instead of Markdown. */
export function isHtmlDocument(
	body: string,
	contentType: string | null,
): boolean {
	if (contentType?.toLowerCase().includes('text/html')) return true
	return /^\s*(?:<!doctype html|<html[\s>])/i.test(body)
}

function stripSitemapComment(content: string): string {
	return content
		.replace(/\r\n/g, '\n')
		.replace(/^<!--\nSitemap:\n[\s\S]*?\n-->\n*/, '')
}

function stripAgentNotices(lines: string[]): string[] {
	const kept: string[] = []
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? ''
		if (line.trim() === TEMPO_CONTEXT_MARKER) {
			index = skipBlockquote(lines, index + 1, (quoted) => {
				// Keep the docs section as a short label so indexed chunks and page
				// reads still say where the page sits in the docs navigation.
				const section = quoted.match(SECTION_CONTEXT_LINE)?.[1]
				if (section) kept.push(`> Section: ${section}`)
				else if (KEPT_CONTEXT_LINE.test(quoted)) kept.push(quoted)
			})
			continue
		}
		if (AGENT_NOTICE_START.some((pattern) => pattern.test(line))) {
			index = skipBlockquote(lines, index)
			continue
		}
		kept.push(line)
	}
	return kept
}

/** Returns the index of the last line in the blockquote starting at `start`. */
function skipBlockquote(
	lines: string[],
	start: number,
	onLine?: (line: string) => void,
): number {
	let index = start
	while (index < lines.length && lines[index]?.startsWith('>')) {
		onLine?.(lines[index] ?? '')
		index++
	}
	return index - 1
}
