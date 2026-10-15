import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/mini'
import { getExplorerHostPolicy } from '#lib/explorer-indexing'
import { feeAmmSearchSchema } from '#lib/fee-amm'
import { liveQuerySchema } from '#lib/live-query'
import { render, toParams, type RuntimeRoute } from '#lib/llms/render'
import { zAddress, zHash } from '#lib/zod'
import wrangler from '#wrangler.json' with { type: 'json' }

const param = (schema: unknown, name: string) =>
	toParams(schema).find((item) => item.name === name)

describe('toParams', () => {
	it('reads literal values and defaults', () => {
		expect(param(feeAmmSearchSchema, 'limit')).toMatchObject({
			types: [],
			values: ['10', '25', '50'],
			default: '10',
			required: false,
		})
		expect(param(liveQuerySchema, 'kind')).toMatchObject({
			values: ['account-transfers', 'token-transfers', 'transactions'],
			required: true,
		})
	})

	it('types addresses, hashes, and unions', () => {
		const schema = z.object({
			address: zAddress(),
			block: z.prefault(z.union([z.literal('latest'), zHash()]), 'latest'),
			calls: z.optional(z.array(z.array(z.string()))),
			page: z.prefault(z.coerce.number(), 1),
		})
		expect(toParams(schema)).toEqual([
			{
				name: 'address',
				types: ['hex'],
				values: [],
				default: undefined,
				required: true,
			},
			{
				name: 'block',
				types: ['hex'],
				values: ['latest'],
				default: 'latest',
				required: false,
			},
			{
				name: 'calls',
				types: ['string[][]'],
				values: [],
				default: undefined,
				required: false,
			},
			{
				name: 'page',
				types: ['number'],
				values: [],
				default: '1',
				required: false,
			},
		])
	})

	it('rejects a parse function', () => {
		expect(() => toParams(z.object({}).parse)).toThrow(/not `schema.parse`/)
	})
})

describe('render', () => {
	const routes: RuntimeRoute[] = [
		{
			fullPath: '/tx/$hash',
			options: {
				validateSearch: z.object({
					tab: z.prefault(z.enum(['overview', 'raw']), 'overview'),
					r: z.optional(z.string()),
				}),
			},
		},
		{
			fullPath: '/api/search',
			options: { server: { handlers: { GET: () => {} } } },
		},
	]
	const docs = {
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
		'/api/search': {
			title: 'Search',
			description: 'Searches everything.',
			input: z.object({ q: z.optional(z.string()) }),
			params: { q: { description: 'Search query.', required: true } },
		},
	} as const

	it('renders pages and API routes from the route tree', () => {
		const files = render(docs, routes)
		expect(files['llms.txt']).toContain(
			'- Transaction: `/tx/{hash}`\n  - `?tab=overview|raw`',
		)
		expect(files['llms.txt']).toContain(
			'- Search: `GET /api/search?q={string}`',
		)
		expect(files['llms.txt']).not.toContain('?r=')
		expect(files['llms-full.txt']).toContain(
			'- `tab` (default `overview`): Transaction view.\n  - `overview`: Summary.',
		)
		expect(files['llms-full.txt']).toContain(
			'- `q` (string, required): Search query.',
		)
	})

	it('fails on a documented route that does not exist', () => {
		expect(() =>
			render({ ...docs, '/gone': { title: 'Gone', description: '' } }, routes),
		).toThrow('/gone: documented but no route exists')
	})
})

describe('templates', () => {
	it.each([
		'llms.template.md',
		'llms-full.template.md',
	])('%s lists every wrangler.json network', (file) => {
		const template = readFileSync(
			new URL(`../src/lib/llms/${file}`, import.meta.url),
			'utf8',
		)
		for (const [name, env] of Object.entries(wrangler.env)) {
			const hosts = env.routes.map((route) => route.pattern)
			const aliases = hosts.filter((host) =>
				getExplorerHostPolicy(`https://${host}/`),
			)
			const primary = hosts.filter((host) => !aliases.includes(host))
			expect(template).toContain(
				`| ${name} | ${primary.map((host) => `https://${host}`).join(', ')} | ${aliases.join(', ') || '-'} |`,
			)
		}
	})
})
