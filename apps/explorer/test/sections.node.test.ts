import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Sections } from '#comps/Sections'

const sections = [
	{ title: 'Transactions', content: 'transaction rows' },
	{ title: 'Transfers', content: 'transfer rows' },
	{ title: 'Holdings', content: 'holding rows' },
]

describe('mobile sections', () => {
	it.each([0, 1, 2])('opens the URL-selected section %i', (activeSection) => {
		const html = renderToStaticMarkup(
			createElement(Sections, {
				mode: 'stacked',
				activeSection,
				onSectionChange: vi.fn(),
				sections,
			}),
		)
		for (const [index, section] of sections.entries()) {
			expect(html.includes(section.content)).toBe(index === activeSection)
		}
		expect(html.match(/aria-expanded="true"/g)).toHaveLength(1)
	})

	it('keeps uncontrolled sections collapsed unless explicitly expanded', () => {
		const html = renderToStaticMarkup(
			createElement(Sections, {
				mode: 'stacked',
				defaultExpandedSection: 'Transfers',
				sections,
			}),
		)
		expect(html).toContain('transfer rows')
		expect(html).not.toContain('transaction rows')
		expect(html).not.toContain('holding rows')
	})

	it('keeps non-collapsible content visible alongside the selected section', () => {
		const html = renderToStaticMarkup(
			createElement(Sections, {
				mode: 'stacked',
				activeSection: 1,
				onSectionChange: vi.fn(),
				sections: [
					{ ...sections[0], autoCollapse: false },
					...sections.slice(1),
				],
			}),
		)
		expect(html).toContain('transaction rows')
		expect(html).toContain('transfer rows')
		expect(html).not.toContain('holding rows')
	})
})
