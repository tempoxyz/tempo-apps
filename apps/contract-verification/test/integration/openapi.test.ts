import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { app } from '#index.tsx'
import { isNonPublicServerUrl } from '#lib/openapi.ts'

describe('GET /openapi.json', () => {
	it('serves only publicly reachable servers outside development', async () => {
		const response = await app.request('/openapi.json', {}, env)

		expect(response.status).toBe(200)
		const spec = (await response.json()) as {
			servers: Array<{ url: string }>
		}
		expect(spec.servers.length).toBeGreaterThan(0)
		expect(
			spec.servers.map((server) => server.url).filter(isNonPublicServerUrl),
		).toStrictEqual([])
	})
})

describe('GET /docs', () => {
	it('lists no local servers outside development', async () => {
		const response = await app.request('/docs', {}, env)

		expect(response.status).toBe(200)
		const body = await response.text()
		expect(body).not.toContain('localhost:{port}')
		expect(body).not.toContain('.ts.net')
	})
})
