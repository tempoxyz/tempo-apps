import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/mini'
import { api } from '../src/docs'
import { fromHono, type HonoDocs } from '../src/hono'
import { render } from '../src/render'

const usageQuery = z.object({
	from: z.optional(z.coerce.number()),
	to: z.optional(z.coerce.number()),
})

const keyBody = z.object({ label: z.string() })

const admin = new Hono()
	.use(async (_, next) => {
		await next()
	})
	.post('/keys', zValidator('json', keyBody), (c) => c.json({}, 201))
	.get('/keys', (c) => c.json([]))
	.delete('/keys/:key', (c) => c.json({}))

const app = new Hono()
	.use(async (_, next) => {
		await next()
	})
	.route('/admin', admin)
	.get('/usage', zValidator('query', usageQuery), (c) =>
		c.json(c.req.valid('query')),
	)
	.all('/:key{tp_.+}', (c) => c.text(c.req.param('key')))
	.all('/', (c) => c.text('ok'))

type AppDocs = HonoDocs<typeof app>

const docs = {
	'/admin/keys': { hidden: 'Admin API.' },
	'/admin/keys/$key': { hidden: 'Admin API.' },
	'/usage': api(usageQuery, {
		title: 'Usage',
		description: 'Fees paid.',
		params: { from: 'Start time.', to: 'End time.' },
	}),
	'/$key': { title: 'Keyed', description: 'Requests with an API key.' },
	'/': { title: 'Open', description: 'Requests without a key.' },
} satisfies AppDocs

describe('fromHono', () => {
	it('lists each path once with its methods, skipping middleware', () => {
		expect(fromHono(app)).toEqual([
			{ path: '/admin/keys', kind: 'api', methods: ['POST', 'GET'] },
			{ path: '/admin/keys/$key', kind: 'api', methods: ['DELETE'] },
			{ path: '/usage', kind: 'api', methods: ['GET'] },
			{ path: '/$key', kind: 'api', methods: ['ALL'] },
			{ path: '/', kind: 'api', methods: ['ALL'] },
		])
	})

	it.each([
		['/tx/:hash', '/tx/$hash'],
		['/:key{tp_.+}', '/$key'],
		['/block/:id?', '/block/$id'],
		['/a/:b{[0-9]+}/c/:d', '/a/$b/c/$d'],
	])('maps %s to %s', (hono, router) => {
		const route = new Hono().get(hono, (c) => c.text(''))
		expect(fromHono(route).map((item) => item.path)).toEqual([router])
	})

	it('renders params from the schema the validator parses', () => {
		const files = render({
			docs,
			routes: fromHono(app),
			templates: { index: '{{apiIndex}}', full: '{{api}}' },
		})
		expect(files.index).toBe(
			[
				'- Usage: `GET /usage`',
				'- Keyed: `ALL /{key}`',
				'- Open: `ALL /`',
			].join('\n'),
		)
		expect(files.full).toContain(
			[
				'Query parameters:',
				'',
				'- `from` (number): Start time.',
				'- `to` (number): End time.',
			].join('\n'),
		)
	})
})

describe('HonoDocs', () => {
	it('keys every route by its router path', () => {
		expectTypeOf<keyof AppDocs>().toEqualTypeOf<
			'/admin/keys' | '/admin/keys/$key' | '/usage' | '/$key' | '/'
		>()
	})

	it('requires api() with the keys the validator parses', () => {
		const doc = { title: 'Usage', description: 'Fees paid.' }
		expectTypeOf(docs['/usage']).toExtend<AppDocs['/usage']>()
		expectTypeOf(doc).not.toExtend<AppDocs['/usage']>()
		expectTypeOf(
			api(z.object({ from: z.optional(z.string()) }), {
				...doc,
				params: { from: 'Start time.' },
			}),
		).not.toExtend<AppDocs['/usage']>()
		expectTypeOf(
			api(z.object({ ...usageQuery.shape, page: z.string() }), {
				...doc,
				params: { from: 'Start.', to: 'End.', page: 'Page.' },
			}),
		).not.toExtend<AppDocs['/usage']>()
	})

	it('rejects api() on a route without a validator', () => {
		expectTypeOf(
			api(usageQuery, {
				title: 'Open',
				description: 'Requests without a key.',
				params: { from: 'Start time.', to: 'End time.' },
			}),
		).not.toExtend<AppDocs['/']>()
	})

	it('accepts a hidden entry for any route', () => {
		expectTypeOf({ hidden: 'Internal.' }).toExtend<AppDocs['/usage']>()
		expectTypeOf({ hidden: 'Internal.' }).toExtend<AppDocs['/']>()
	})
})
