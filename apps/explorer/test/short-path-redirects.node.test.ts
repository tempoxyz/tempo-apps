import { beforeEach, describe, expect, it, vi } from 'vitest'
import server from '../src/index.server'

vi.mock('@sentry/cloudflare', () => ({
	withSentry: (_options: unknown, entry: unknown) => entry,
}))

vi.mock('@tanstack/react-start/server-entry', () => ({
	createServerEntry: (entry: unknown) => entry,
	default: {
		fetch: vi.fn(() => new Response('handled by router')),
	},
}))

const address = '0x376532b2E0E83B61b55A0a86F6c9079bE759A667'
const hash = `0x${'aB12'.repeat(16)}`

function fetchPath(path: string) {
	return server.fetch(
		new Request(`https://explore.tempo.xyz${path}`),
		{} as Cloudflare.Env,
		{} as ExecutionContext,
	)
}

beforeEach(() => vi.clearAllMocks())

describe('explorer short paths', () => {
	it.each([
		[`/${address}`, `/address/${address}`],
		[`/${address}/`, `/address/${address}`],
		['/123456', '/block/123456'],
		['/0', '/block/0'],
		['/123456/', '/block/123456'],
		[`/${hash}`, `/receipt/${hash}`],
		[`/${hash}/`, `/receipt/${hash}`],
		[`/${address}?tab=contract`, `/address/${address}?tab=contract`],
		['/blocks/123456', '/block/123456'],
		[`/transaction/${hash}`, `/tx/${hash}`],
		[`/tokens/${address}`, `/token/${address}`],
	])('permanently redirects %s to %s', async (from, to) => {
		const response = await fetchPath(from)
		expect(response.status).toBe(301)
		expect(response.headers.get('Location')).toBe(
			`https://explore.tempo.xyz${to}`,
		)
	})

	it.each([
		'/',
		'/search?q=123456',
		`/address/${address}`,
		'/block/123456',
		`/receipt/${hash}`,
		'/0x1234',
		`/0x${'g'.repeat(40)}`,
		`/0x${'a'.repeat(63)}`,
		`/${address}/extra`,
		'/-1',
		'/1.5',
		'/unknown',
	])('leaves %s to the router', async (path) => {
		const response = await fetchPath(path)
		expect(response.status).toBe(200)
		expect(response.headers.get('Location')).toBeNull()
		expect(await response.text()).toBe('handled by router')
	})
})
