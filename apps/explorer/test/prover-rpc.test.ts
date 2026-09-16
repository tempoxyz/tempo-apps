import { afterEach, describe, expect, it, vi } from 'vitest'
import { forwardProverRpc } from '#lib/server/prover-rpc'
import { ZONE_PROVER_RPC_URL } from '#lib/zone-prover'

const authorization = 'Basic cnBjOnRlc3Q='
const body = JSON.stringify([
	{
		jsonrpc: '2.0',
		id: 1,
		method: 'eth_getBlockByNumber',
		params: ['latest', false],
	},
])

afterEach(() => vi.unstubAllGlobals())

function request() {
	return new Request('https://example.invalid/api/rpc', {
		method: 'POST',
		body,
	})
}

describe('prover RPC in the Workers runtime', () => {
	it('constructs a valid upstream request and forwards the response', async () => {
		const upstream = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				// Keep workerd Request validation: a plain fetch stub hides unsupported
				// options such as redirect: "error", which throws before any network I/O.
				const outgoing = new Request(input, init)
				expect(outgoing.url).toBe(`${ZONE_PROVER_RPC_URL}/`)
				expect(outgoing.redirect).toBe('manual')
				expect(outgoing.headers.get('Authorization')).toBe(authorization)
				expect(await outgoing.text()).toBe(body)
				return new Response('[{"jsonrpc":"2.0","id":1,"result":null}]')
			},
		)
		vi.stubGlobal('fetch', upstream)

		const response = await forwardProverRpc(request(), authorization)
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual([
			{ jsonrpc: '2.0', id: 1, result: null },
		])
		expect(upstream).toHaveBeenCalledOnce()
	})

	it.each([
		301, 302, 303, 307, 308, 401, 403, 500,
	])('rejects upstream status %s without following redirects or exposing its body', async (status) => {
		const upstream = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const outgoing = new Request(input, init)
				expect(outgoing.redirect).toBe('manual')
				return new Response('upstream diagnostic body', {
					status,
					headers: { Location: 'https://example.invalid/redirect' },
				})
			},
		)
		vi.stubGlobal('fetch', upstream)

		const response = await forwardProverRpc(request(), authorization)
		expect(response.status).toBe(502)
		expect(await response.text()).toBe('Prover RPC unavailable')
		expect(response.headers.get('Location')).toBeNull()
		expect(upstream).toHaveBeenCalledOnce()
		expect(upstream.mock.calls[0]?.[1]?.redirect).toBe('manual')
	})
})
