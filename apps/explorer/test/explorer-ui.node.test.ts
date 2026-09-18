import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BlockCard } from '#comps/BlockCard'
import { DataGrid } from '#comps/DataGrid'
import { SegmentedControl } from '#comps/PanelToolbar'
import { Sections } from '#comps/Sections'
import { Fact } from '#comps/SimulateShared'

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		title,
		className,
	}: {
		children?: React.ReactNode
		to: string
		title?: string
		className?: string
	}) => React.createElement('a', { href: to, title, className }, children),
	useRouterState: () => false,
}))
vi.mock('#lib/block-number', () => ({
	useAnimatedBlockNumber: () => undefined,
}))
vi.mock('#lib/queries', () => ({ SimulationApiError: class extends Error {} }))

const render = renderToStaticMarkup
const el = React.createElement

describe('explorer UI regressions', () => {
	it('renders the Unix epoch in the genesis UTC row', () => {
		const html = render(
			el(BlockCard, {
				block: {
					number: 0n,
					timestamp: 0n,
					gasUsed: 0n,
					gasLimit: 500_000_000n,
					transactions: [],
				} as unknown as BlockCard.Props['block'],
			}),
		)
		expect(html).toMatch(
			/<time dateTime="1970-01-01T00:00:00.000Z"><span[^>]*>[^<]+<\/span>[^<]+<\/time>/,
		)
		expect(html).toContain('1970')
	})

	const columns: DataGrid.Column[] = [
		{ label: 'Token', width: '1fr' },
		{ label: 'Holders', width: '1fr', sortDirection: 'desc' },
	]
	const grid = (items: DataGrid.Row[], loading = false) =>
		el(DataGrid, {
			columns: { tabs: columns, stacked: columns },
			items: () => items,
			totalItems: items.length,
			page: 1,
			itemsPerPage: 2,
			itemsLabel: 'tokens',
			loading,
		})

	it('exposes column headers and cells, with the row link inside a cell', () => {
		const html = render(
			grid([
				{
					cells: ['USD', '42'],
					link: { href: '/token/example', title: 'View token USD' },
				},
			]),
		)
		expect(html).toMatch(/<table[^>]*aria-label="tokens"/)
		expect(html.match(/<th\s/g)).toHaveLength(2)
		expect(html.match(/<td\s/g)).toHaveLength(2)
		expect(html).toContain('scope="col"')
		expect(html).toContain('aria-sort="descending"')
		expect(html).toMatch(/<td[^>]*><a[^>]*href="\/token\/example"/)
	})

	it('keeps multiline and expanded rows inside valid table rows', () => {
		const html = render(
			grid([
				{
					cells: [
						['A', 'B'],
						['1', '2'],
					],
					expanded: 'Details',
				},
			]),
		)
		expect(html.match(/<tr\s/g)).toHaveLength(4)
		expect(html.match(/<td\s/g)).toHaveLength(5)
		expect(html).toMatch(/<td colSpan="2"[^>]*>Details<\/td>/)
	})

	it('uses spanning cells for empty tables and valid cells while loading', () => {
		expect(render(grid([]))).toMatch(
			/<td colSpan="2"[^>]*>No items found\.<\/td>/,
		)
		const loading = render(grid([], true))
		expect(loading).toContain('aria-busy="true"')
		expect(loading.match(/<td\s/g)).toHaveLength(4)
	})

	it('connects collapsed mobile disclosures to unique, existing hidden panels', () => {
		const section = { title: 'Token details', content: 'Content' }
		const html = render(
			el(
				React.Fragment,
				null,
				el(Sections, { mode: 'stacked', sections: [section] }),
				el(Sections, { mode: 'stacked', sections: [section] }),
			),
		)
		const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map(
			(match) => match[1],
		)
		expect(new Set(controls).size).toBe(2)
		expect(html.match(/aria-expanded="false"/g)).toHaveLength(2)
		for (const id of controls) {
			expect(id).not.toMatch(/\s/)
			expect(html).toContain(`id="${id}" hidden=""`)
		}
		expect(html).not.toContain('Content')
	})

	it('keeps non-collapsible mobile sections visible', () => {
		const html = render(
			el(Sections, {
				mode: 'stacked',
				sections: [
					{ title: 'Tokens', content: 'Content', autoCollapse: false },
				],
			}),
		)
		expect(html).toContain('Content')
		expect(html).not.toContain('hidden=""')
		expect(html).not.toContain('aria-expanded')
	})

	it('exposes simulation facts as terms and definitions', () => {
		const html = render(
			el('dl', null, el(Fact, { label: 'Gas used', children: '42' })),
		)
		expect(html).toMatch(/<dt[^>]*>Gas used<\/dt><dd[^>]*>42<\/dd>/)
	})

	it('only puts the selected segmented tab in the Tab sequence', () => {
		const html = render(
			el(SegmentedControl, {
				value: 'split',
				options: ['input', 'split', 'output'].map((value) => ({
					value,
					label: value,
				})),
				onChange: () => {},
			}),
		)
		expect(html.match(/tabindex="0"/g)).toHaveLength(1)
		expect(html.match(/tabindex="-1"/g)).toHaveLength(2)
		expect(html).toMatch(/aria-selected="true" tabindex="0"/)
	})
})
