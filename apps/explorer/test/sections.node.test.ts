import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Sections } from '#comps/Sections'

const sections = [
	{ title: 'Transactions', content: 'transaction rows' },
	{ title: 'Transfers', content: 'transfer rows' },
	{ title: 'Holdings', content: 'holding rows' },
]

/** The content of each rendered tab panel, and whether it shows. */
function panels(html: string) {
	return [
		...html.matchAll(/<div([^>]*role="tabpanel"[^>]*)>(.*?)<\/div>/g),
	].map(([, attributes, content]) => ({
		content,
		visible: !/\shidden=""/.test(attributes ?? ''),
	}))
}

describe('sections', () => {
	it.each([0, 1, 2])('opens the URL-selected tab %i', (activeSection) => {
		const html = renderToStaticMarkup(
			createElement(Sections, {
				activeSection,
				onSectionChange: vi.fn(),
				sections,
			}),
		)
		expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
		expect(panels(html)).toEqual(
			sections.map((section, index) => ({
				content: section.content,
				visible: index === activeSection,
			})),
		)
	})

	it.each([
		0, 1, 2,
	])('mounts only the URL-selected section %i on small screens', (activeSection) => {
		const html = renderToStaticMarkup(
			createElement(Sections, {
				mode: 'stacked',
				activeSection,
				onSectionChange: vi.fn(),
				sections,
			}),
		)
		expect(html.match(/role="tab"/g)).toHaveLength(sections.length)
		expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
		expect(panels(html)).toEqual([
			{ content: sections[activeSection]?.content, visible: true },
		])
	})

	it('names a single section by its heading', () => {
		const html = renderToStaticMarkup(
			createElement(Sections, {
				sections: [{ title: 'Tokens', content: 'token rows' }],
			}),
		)
		const id = html.match(/<h2[^>]*\sid="([^"]+)"[^>]*>Tokens<\/h2>/)?.[1]
		expect(id).toBeDefined()
		expect(html.match(/<section[^>]*>/)?.[0]).toContain(
			`aria-labelledby="${id}"`,
		)
		expect(html).toContain('token rows')
		expect(html).not.toContain('role="tab"')
	})

	it('leaves out hidden sections', () => {
		const html = renderToStaticMarkup(
			createElement(Sections, {
				activeSection: 0,
				onSectionChange: vi.fn(),
				sections: [
					sections[0],
					{ ...sections[1], visible: false },
					sections[2],
				],
			}),
		)
		expect(html).not.toContain('Transfers')
		expect(panels(html).map((panel) => panel.content)).toEqual([
			'transaction rows',
			'holding rows',
		])
	})
})
