import { describe, expect, it } from 'vitest'
import { isHtmlDocument, normalizeDocsMarkdown } from './markdown.js'

describe('normalizeDocsMarkdown', () => {
	it('reduces the Tempo docs breadcrumb to its section and strips the MCP notice', () => {
		const page = [
			'<!-- tempo-docs-context -->',
			'> Source: [/docs/api/mcp](https://tempo.xyz/developers/docs/api/mcp.md)',
			'> Section: [APIs & SDKs](https://tempo.xyz/developers/docs/tools.md). API reference.',
			'> [Documentation index](https://tempo.xyz/developers/llms.txt) · [Docs skill](https://tempo.xyz/developers/SKILL.md)',
			'',
			'> Tempo MCP: Use `search`, `find_pages`, `read_page`, and `code` at `https://mcp.tempo.xyz` for Tempo and related documentation.',
			'> If an indexed page is missing or reflects an older site, read this site’s documentation index.',
			'',
			'# MCP',
			'',
			'> A real callout stays.',
		].join('\n')

		expect(normalizeDocsMarkdown(page)).toBe(
			'> Section: APIs & SDKs\n\n# MCP\n\n> A real callout stays.',
		)
	})

	it('keeps the earlier sandbox warning from the breadcrumb', () => {
		const page = [
			'<!-- tempo-docs-context -->',
			'> Source: [/docs/guide/private-zones/a](https://tempo.xyz/developers/docs/guide/private-zones/a.md)',
			'> Section: [Zones](/docs/zones.md). Private balances, deposits, and withdrawals.',
			'> Earlier testnet sandbox: use [Zones](/docs/zones.md) for the current limited preview.',
			'> [Documentation index](/llms.txt)',
			'',
			'# Send tokens within a zone',
		].join('\n')

		expect(normalizeDocsMarkdown(page)).toBe(
			'> Section: Zones\n> Earlier testnet sandbox: use [Zones](/docs/zones.md) for the current limited preview.\n\n# Send tokens within a zone',
		)
	})

	it('strips Vocs MCP notices', () => {
		const page = [
			"> **Can't find what you're looking for?** Use `search_docs` on the docs MCP server at `https://vocs.dev/api/mcp` to find what you need.",
			'>',
			'> **Have feedback?** Use `submit_feedback` on the same MCP server.',
			'',
			'# MCP Server',
		].join('\n')

		expect(normalizeDocsMarkdown(page)).toBe('# MCP Server')
	})

	it('strips sitemap comments and docs chrome', () => {
		const page = [
			'<!--',
			'Sitemap:',
			'- [A](/a)',
			'-->',
			'',
			'Skip to content',
			'<span id="legacy-anchor" />',
			'',
			'# Page',
			'Was this helpful?',
			'',
			'',
			'',
			'Body',
		].join('\n')

		expect(normalizeDocsMarkdown(page)).toBe('# Page\n\nBody')
	})

	it('preserves notice and chrome examples in fenced and indented code', () => {
		const page = [
			'# Examples',
			'',
			'```markdown',
			'> Tempo MCP: This is a sample blockquote.',
			'<span id="legacy-anchor" />',
			'',
			'',
			'Was this helpful?',
			'```',
			'',
			'    <span id="legacy-anchor" />',
			'    > Tempo MCP: This is indented code.',
			'',
			'> Tempo MCP: Remove this real notice.',
			'',
			'Was this helpful?',
		].join('\n')

		expect(normalizeDocsMarkdown(page)).toBe(
			[
				'# Examples',
				'',
				'```markdown',
				'> Tempo MCP: This is a sample blockquote.',
				'<span id="legacy-anchor" />',
				'',
				'',
				'Was this helpful?',
				'```',
				'',
				'    <span id="legacy-anchor" />',
				'    > Tempo MCP: This is indented code.',
			].join('\n'),
		)
	})
})

describe('isHtmlDocument', () => {
	it('detects HTML by content type or document prefix', () => {
		expect(isHtmlDocument('# Title', 'text/html; charset=utf-8')).toBe(true)
		expect(isHtmlDocument('<!DOCTYPE html><html>', 'text/markdown')).toBe(true)
		expect(isHtmlDocument('  <html lang="en">', null)).toBe(true)
		expect(
			isHtmlDocument('# Title\n\n<div>inline</div>', 'text/markdown'),
		).toBe(false)
	})
})
