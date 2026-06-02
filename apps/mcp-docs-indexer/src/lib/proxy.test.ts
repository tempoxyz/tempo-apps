import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proxyMcp } from './proxy.js'

describe('proxyMcp', () => {
	const upstream = 'https://99c10de8.search.ai.cloudflare.com'
	const realFetch = globalThis.fetch

	beforeEach(() => {
		vi.restoreAllMocks()
	})

	afterEach(() => {
		globalThis.fetch = realFetch
	})

	it('forwards method, path, query, and body to the upstream origin', async () => {
		const seen: { url?: string; init?: RequestInit } = {}
		globalThis.fetch = vi.fn(async (url: RequestInfo, init?: RequestInit) => {
			seen.url = String(url)
			seen.init = init
			return new Response('{"ok":true}', {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})
		}) as unknown as typeof fetch

		const req = new Request('https://mcp.tempo.xyz/mcp?x=1', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'text/event-stream',
			},
			body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
		})
		const res = await proxyMcp(req, upstream)
		expect(res.status).toBe(200)
		expect(await res.text()).toBe('{"ok":true}')
		expect(seen.url).toBe(`${upstream}/mcp?x=1`)
		expect(seen.init?.method).toBe('POST')
		const headers = new Headers(seen.init?.headers as HeadersInit)
		expect(headers.get('content-type')).toBe('application/json')
		expect(headers.get('accept')).toBe('text/event-stream')
		expect(headers.get('host')).toBeNull()
	})

	it('strips Cloudflare hop headers before forwarding', async () => {
		let forwarded: Headers | undefined
		globalThis.fetch = vi.fn(async (_url: RequestInfo, init?: RequestInit) => {
			forwarded = new Headers(init?.headers as HeadersInit)
			return new Response('ok')
		}) as unknown as typeof fetch

		const req = new Request('https://mcp.tempo.xyz/mcp', {
			method: 'GET',
			headers: {
				'cf-connecting-ip': '1.2.3.4',
				'cf-ray': 'abc',
				'x-forwarded-for': '1.2.3.4',
			},
		})
		await proxyMcp(req, upstream)
		expect(forwarded?.get('cf-connecting-ip')).toBeNull()
		expect(forwarded?.get('cf-ray')).toBeNull()
		expect(forwarded?.get('x-forwarded-for')).toBeNull()
	})

	it('honours an upstream that already includes a path', async () => {
		let seenUrl = ''
		globalThis.fetch = vi.fn(async (url: RequestInfo) => {
			seenUrl = String(url)
			return new Response('ok')
		}) as unknown as typeof fetch

		const req = new Request('https://mcp.tempo.xyz/anything', { method: 'GET' })
		await proxyMcp(req, `${upstream}/mcp`)
		expect(seenUrl).toBe(`${upstream}/mcp`)
	})
})
