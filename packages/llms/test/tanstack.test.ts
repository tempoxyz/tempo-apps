import { describe, expect, it } from 'vitest'
import { z } from 'zod/mini'
import { fromTanStackRouter } from '../src/tanstack'

const search = z.object({ q: z.optional(z.string()) })

/** Shaped like `getRouter().routesById`: root, pathless layout, and leaves. */
const router = {
	routesById: {
		__root__: { isRoot: true, fullPath: '/', options: {} },
		'/_layout': { fullPath: '/', options: { id: '/_layout' } },
		'/_layout/': {
			fullPath: '/',
			options: { id: '/', path: '/', validateSearch: search },
		},
		'/api/health': {
			fullPath: '/api/health',
			options: {
				path: '/api/health',
				server: { handlers: { GET: () => new Response('ok') } },
			},
		},
	},
}

describe('fromTanStackRouter', () => {
	it('keeps addressable routes and classifies API routes', () => {
		expect(fromTanStackRouter(router)).toEqual([
			{ path: '/', kind: 'page', methods: [], search },
			{
				path: '/api/health',
				kind: 'api',
				methods: ['GET'],
				search: undefined,
			},
		])
	})

	it('accepts another API prefix', () => {
		expect(
			fromTanStackRouter(router, '/v1/').map((route) => route.kind),
		).toEqual(['page', 'page'])
	})
})
