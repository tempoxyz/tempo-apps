import { afterEach, describe, expect, it, vi } from 'vitest'
import { getExplorerRpcBackend } from '#lib/server/network'
import { forwardRpc } from '#lib/server/rpc'

const target = getExplorerRpcBackend('testnet', 'explorer:test-credential')

afterEach(() => vi.unstubAllGlobals())

function request(body: unknown) {
	return new Request('https://explore.testnet.tempo.xyz/api/rpc?key=caller', {
		method: 'POST',
		headers: { Authorization: 'Bearer caller', Cookie: 'session=caller' },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	})
}

describe('Explorer Orchestra routing', () => {
	it.each([
		['mainnet', 4217, 'https://rpc.tempo.xyz'],
		['testnet', 42431, 'https://rpc.testnet.tempo.xyz'],
		['devnet', 31318, 'https://rpc.devnet.tempoxyz.dev'],
		['nextfork', 31318, 'https://rpc-nextfork.devnet.tempoxyz.dev'],
	])('selects %s independently of request host and chain ID', (environment, chainId, url) => {
		expect(
			getExplorerRpcBackend(environment, 'explorer:test-credential'),
		).toEqual({
			chainId,
			url,
			headers: { Authorization: `Basic ${btoa('explorer:test-credential')}` },
		})
	})
	it.each([
		undefined,
		'',
		'bare-key',
		':key',
		'client:',
		'client:key\r\nInjected: value',
	])('fails closed for malformed credentials %s', (auth) => {
		expect(() => getExplorerRpcBackend('testnet', auth)).toThrow('credentials')
	})
	it.each([
		undefined,
		'constructor',
		'https://attacker.invalid',
		'unknown',
	])('rejects an unknown deployment %s', (environment) => {
		expect(() =>
			getExplorerRpcBackend(environment, 'explorer:test-credential'),
		).toThrow('network')
	})
})

describe('Explorer RPC forwarding in Workers', () => {
	it('forwards a read/broadcast batch using only server credentials', async () => {
		const payload = [
			{ jsonrpc: '2.0', id: 1, method: 'eth_chainId' },
			{
				jsonrpc: '2.0',
				id: 2,
				method: 'eth_sendRawTransaction',
				params: ['0x1234'],
			},
		]
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const outgoing = new Request(input, init)
				expect(outgoing.url).toBe('https://rpc.testnet.tempo.xyz/')
				expect(outgoing.headers.get('Authorization')).toBe(
					target.headers.Authorization,
				)
				expect(outgoing.headers.get('Cookie')).toBeNull()
				expect(outgoing.redirect).toBe('manual')
				expect(await outgoing.json()).toEqual(payload)
				return Response.json([{ jsonrpc: '2.0', id: 1, result: '0xa5bf' }], {
					headers: { 'Set-Cookie': 'upstream=private' },
				})
			}),
		)
		const response = await forwardRpc(request(payload), target)
		expect(response.status).toBe(200)
		expect(response.headers.get('Set-Cookie')).toBeNull()
		expect(response.headers.get('Cache-Control')).toBe('no-store')
		expect(await response.json()).toEqual([
			{ jsonrpc: '2.0', id: 1, result: '0xa5bf' },
		])
	})
	it.each([
		'debug_setHead',
		'miner_setGasPrice',
		'eth_sendTransaction',
		'eth_sign',
		'tempo_fundAddress',
		'admin_peers',
	])('rejects %s in a mixed batch before forwarding', async (method) => {
		const upstream = vi.fn()
		vi.stubGlobal('fetch', upstream)
		const response = await forwardRpc(
			request([
				{ jsonrpc: '2.0', id: 1, method: 'eth_chainId' },
				{ jsonrpc: '2.0', id: 2, method },
			]),
			target,
		)
		expect(response.status).toBe(400)
		expect(upstream).not.toHaveBeenCalled()
	})
	it('canonicalizes duplicate keys before forwarding', async () => {
		const upstream = vi.fn(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				expect(init?.body).toBe(
					'{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}',
				)
				return Response.json({ jsonrpc: '2.0', id: 1, result: '0xa5bf' })
			},
		)
		vi.stubGlobal('fetch', upstream)
		expect(
			(
				await forwardRpc(
					request(
						'{"jsonrpc":"2.0","id":1,"method":"debug_setHead","method":"eth_chainId"}',
					),
					target,
				)
			).status,
		).toBe(200)
	})
	it.each([
		['{', 400],
		['[]', 400],
		[
			JSON.stringify(
				Array.from({ length: 51 }, () => ({
					jsonrpc: '2.0',
					method: 'eth_chainId',
				})),
			),
			400,
		],
		['x'.repeat(128 * 1024 + 1), 413],
	])('rejects invalid or oversized bodies', async (body, status) => {
		const upstream = vi.fn()
		vi.stubGlobal('fetch', upstream)
		expect((await forwardRpc(request(body), target)).status).toBe(status)
		expect(upstream).not.toHaveBeenCalled()
	})
	it.each([
		302, 401, 403, 429, 500,
	])('sanitizes upstream errors (%s) without following redirects', async (status) => {
		const upstream = vi.fn().mockResolvedValue(
			new Response('private upstream diagnostics', {
				status,
				headers: { Location: 'https://attacker.invalid' },
			}),
		)
		vi.stubGlobal('fetch', upstream)
		const response = await forwardRpc(
			request({ jsonrpc: '2.0', method: 'eth_chainId' }),
			target,
		)
		expect(response.status).toBe(status === 429 ? 429 : 502)
		expect(await response.text()).toBe('RPC unavailable')
		expect(response.headers.get('Location')).toBeNull()
		expect(upstream).toHaveBeenCalledOnce()
	})
})
