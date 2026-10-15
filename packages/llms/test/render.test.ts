import { describe, expect, it } from 'vitest'
import { z } from 'zod/mini'
import type { Docs } from '../src/docs'
import { api } from '../src/docs'
import { render, type Route } from '../src/render'

const routes: Route[] = [
	{
		path: '/tx/$hash',
		kind: 'page',
		methods: [],
		search: z.object({
			tab: z.prefault(z.enum(['overview', 'raw']), 'overview'),
			r: z.optional(z.string()),
		}),
	},
	{ path: '/api/search', kind: 'api', methods: ['GET'], search: undefined },
	{ path: '/demo', kind: 'page', methods: [] },
]

const docs: Docs = {
	'/tx/$hash': {
		title: 'Transaction',
		description: 'Shows transaction details.',
		params: {
			tab: {
				description: 'Transaction view.',
				values: { overview: 'Summary.', raw: 'Raw JSON.' },
			},
			r: null,
		},
	},
	'/api/search': api(z.object({ q: z.optional(z.string()) }), {
		title: 'Search',
		description: 'Searches everything.',
		params: { q: { description: 'Search query.', required: true } },
	}),
	'/demo': { hidden: 'Development only.' },
}

const templates = {
	'llms.txt': '# Index\n\n{{pageIndex}}\n\n{{apiIndex}}\n',
	'llms-full.txt': '# Full\n\n{{pages}}\n\n{{api}}\n',
}

const renderWith = (overrides: {
	docs?: Docs
	routes?: Route[]
	prose?: string
}) =>
	render({
		docs: overrides.docs ?? docs,
		routes: overrides.routes ?? routes,
		templates: {
			...templates,
			'llms.txt': `${templates['llms.txt']}${overrides.prose ?? ''}`,
		},
	})

describe('render', () => {
	it('renders the index and full sections', () => {
		const files = render({ docs, routes, templates })
		expect(files['llms.txt']).toBe(
			[
				'# Index',
				'',
				'- Transaction: `/tx/{hash}`',
				'  - `?tab=overview|raw`',
				'',
				'- Search: `GET /api/search?q={string}`',
				'',
			].join('\n'),
		)
		expect(files['llms-full.txt']).toContain(
			'- `tab` (default `overview`): Transaction view.\n  - `overview`: Summary.\n  - `raw`: Raw JSON.',
		)
		expect(files['llms-full.txt']).toContain(
			'- `GET /api/search`\n\nSearches everything.\n\nQuery parameters:\n\n- `q` (string, required): Search query.',
		)
		expect(files['llms-full.txt']).not.toContain('`r`')
	})

	const tx = (params: Record<string, string | null>) => ({
		...docs,
		'/tx/$hash': { title: 'Transaction', description: '', params },
	})

	it.each<[string, Parameters<typeof renderWith>[0], string]>([
		[
			'an undocumented route',
			{ routes: [...routes, { path: '/new', kind: 'page', methods: [] }] },
			'/new: undocumented route',
		],
		[
			'a documented route that does not exist',
			{ routes: routes.filter((route) => route.path !== '/demo') },
			'/demo: documented but no route exists',
		],
		[
			'an undocumented parameter',
			{ docs: tx({ tab: 'Tab.' }) },
			'/tx/$hash: undocumented parameter `r`',
		],
		[
			'a parameter that does not exist',
			{ docs: tx({ tab: 'Tab.', r: null, page: 'Page.' }) },
			'/tx/$hash: parameter `page` does not exist',
		],
		[
			'a duplicate route path',
			{ routes: [...routes, ...routes.slice(0, 1)] },
			'/tx/$hash: more than one route',
		],
	])('throws on %s', (_, overrides, error) => {
		expect(() => renderWith(overrides)).toThrow(error)
	})

	it.each([
		'`/tx/0xabc?tab=raw`',
		'`/tx/{hash}?tab=overview|raw`',
		'```txt\n/api/search?q={input}\n```',
		'[full reference](/llms-full.txt)',
	])('accepts the path in %s', (prose) => {
		expect(() => renderWith({ prose })).not.toThrow()
	})

	it.each([
		['`/api/tokens/count`', '/api/tokens/count: no documented route matches'],
		['`/demo`', '/demo: no documented route matches'],
		['`/tx/{hash}?tab=trace`', '`tab=trace` is not one of overview, raw'],
		[
			'```txt\n/tx/{hash}?r=https://rpc\n```',
			'`r` is not a documented parameter of /tx/{hash}',
		],
	])('rejects the path in %s', (prose, error) => {
		expect(() => renderWith({ prose })).toThrow(error)
	})
})
