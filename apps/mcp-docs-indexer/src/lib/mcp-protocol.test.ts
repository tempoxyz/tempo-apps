import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleMcp } from './mcp.js'
import type { Source } from './sources.js'

const sources: Source[] = [
	{
		id: 'tempo',
		base: 'https://tempo.xyz/developers',
		description: 'Tempo docs: Accounts, Earn, and Routes',
	},
	{ id: 'viem', base: 'https://viem.sh' },
]

const context = {
	instance: {
		search: async () => ({ search_query: '', chunks: [] }),
	} as unknown as AiSearchInstance,
	sources,
}

// Search looks up docs sections in source indexes; keep tests off the network
// unless they stub the responses they need.
beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('not found', { status: 404 })),
	)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

function post(body: unknown, headers: Record<string, string> = {}): Request {
	return new Request('https://mcp.tempo.xyz/', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	})
}

describe('handleMcp protocol', () => {
	it('initializes locally with resources and server instructions', async () => {
		const res = await handleMcp(
			post({
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: '2025-06-18',
					capabilities: {},
					clientInfo: { name: 'test', version: '1.0.0' },
				},
			}),
			context,
		)

		const body = await res.json()
		expect(body.result).toMatchObject({
			protocolVersion: '2025-06-18',
			capabilities: { tools: {}, resources: {} },
			serverInfo: { name: 'tempo-docs', title: 'Tempo Docs' },
		})
		expect(body.result.instructions).toContain(
			'Sources: `tempo` (Tempo docs: Accounts, Earn, and Routes); `viem`.',
		)
		expect(body.result.instructions).toContain('find_pages')
	})

	it('answers unsupported protocol versions with the latest version', async () => {
		const res = await handleMcp(
			post({
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: { protocolVersion: '1999-01-01' },
			}),
			context,
		)

		const body = await res.json()
		expect(body.result.protocolVersion).toBe('2025-11-25')
	})

	it('answers ping', async () => {
		const res = await handleMcp(
			post({ jsonrpc: '2.0', id: 'p', method: 'ping' }),
			context,
		)

		expect(await res.json()).toEqual({ jsonrpc: '2.0', id: 'p', result: {} })
	})

	it.each([
		['notification', { jsonrpc: '2.0', method: 'notifications/initialized' }],
		[
			'notification-shaped tool call',
			{
				jsonrpc: '2.0',
				method: 'tools/call',
				params: { name: 'search', arguments: { query: 'fees' } },
			},
		],
		['client response', { jsonrpc: '2.0', id: 4, result: {} }],
	])('accepts a %s without a response body', async (_, message) => {
		const res = await handleMcp(post(message), context)

		expect(res.status).toBe(202)
		expect(await res.text()).toBe('')
	})

	it('answers batch requests for 2025-03-26 clients', async () => {
		const res = await handleMcp(
			post([
				{ jsonrpc: '2.0', id: 1, method: 'ping' },
				{ jsonrpc: '2.0', method: 'notifications/initialized' },
				{ jsonrpc: '2.0', id: 2, method: 'prompts/list' },
			]),
			context,
		)

		expect(res.status).toBe(200)
		expect(await res.json()).toEqual([
			{ jsonrpc: '2.0', id: 1, result: {} },
			{
				jsonrpc: '2.0',
				id: 2,
				error: { code: -32601, message: 'Method not found: prompts/list' },
			},
		])
	})

	it('answers an array inside a batch as an invalid request', async () => {
		const res = await handleMcp(
			post([
				[{ jsonrpc: '2.0', id: 1, method: 'ping' }],
				{ jsonrpc: '2.0', id: 2, method: 'ping' },
			]),
			context,
		)

		expect(await res.json()).toEqual([
			{
				jsonrpc: '2.0',
				id: null,
				error: {
					code: -32600,
					message: 'Invalid request: expected a JSON-RPC 2.0 message',
				},
			},
			{ jsonrpc: '2.0', id: 2, result: {} },
		])
	})

	it('rejects batches over 20 messages', async () => {
		const res = await handleMcp(
			post(
				Array.from({ length: 21 }, (_, id) => ({
					jsonrpc: '2.0',
					id,
					method: 'ping',
				})),
			),
			context,
		)

		expect(res.status).toBe(400)
		expect((await res.json()).error.message).toBe(
			'Batch too large: send at most 20 messages',
		)
	})

	it('accepts a batch of notifications without a response body', async () => {
		const res = await handleMcp(
			post([{ jsonrpc: '2.0', method: 'notifications/initialized' }]),
			context,
		)

		expect(res.status).toBe(202)
	})

	it('rejects an empty batch', async () => {
		const res = await handleMcp(post([]), context)

		expect(res.status).toBe(400)
		expect((await res.json()).error.code).toBe(-32600)
	})

	it('negotiates initialize even with a newer MCP-Protocol-Version header', async () => {
		const res = await handleMcp(
			post(
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'initialize',
					params: { protocolVersion: '2099-01-01' },
				},
				{ 'mcp-protocol-version': '2099-01-01' },
			),
			context,
		)

		expect(res.status).toBe(200)
		expect((await res.json()).result.protocolVersion).toBe('2025-11-25')
	})

	it('rejects unsupported MCP-Protocol-Version headers', async () => {
		const res = await handleMcp(
			post(
				{ jsonrpc: '2.0', id: 1, method: 'ping' },
				{ 'mcp-protocol-version': '1999-01-01' },
			),
			context,
		)

		expect(res.status).toBe(400)
		expect((await res.json()).error.message).toBe(
			'Unsupported MCP-Protocol-Version: 1999-01-01',
		)
	})

	it('rejects invalid JSON', async () => {
		const res = await handleMcp(post('{"jsonrpc":'), context)

		expect(res.status).toBe(400)
		expect((await res.json()).error.code).toBe(-32700)
	})

	it('rejects messages that are not JSON-RPC 2.0 requests', async () => {
		const res = await handleMcp(post({ id: 1, method: 'ping' }), context)

		expect(res.status).toBe(400)
		expect((await res.json()).error.code).toBe(-32600)
	})

	it('returns method not found for unsupported methods', async () => {
		const res = await handleMcp(
			post({ jsonrpc: '2.0', id: 5, method: 'prompts/list' }),
			context,
		)

		expect((await res.json()).error).toEqual({
			code: -32601,
			message: 'Method not found: prompts/list',
		})
	})

	it.each([
		[{}, 'params.name must be a string'],
		[{ name: 'nope', arguments: {} }, 'Unknown tool: nope'],
		[
			{ name: 'code', arguments: { code: 'async () => 1' } },
			'Unknown tool: code',
		],
	])('rejects tool calls with params %j', async (params, message) => {
		const res = await handleMcp(
			post({ jsonrpc: '2.0', id: 6, method: 'tools/call', params }),
			context,
		)

		expect((await res.json()).error).toEqual({ code: -32602, message })
	})

	it('rejects non-POST requests', async () => {
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', { method: 'GET' }),
			context,
		)

		expect(res.status).toBe(405)
		expect(res.headers.get('allow')).toBe('POST, OPTIONS')
		expect(res.headers.get('access-control-allow-origin')).toBe('*')
	})

	it('answers CORS preflight requests', async () => {
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'OPTIONS',
				headers: {
					origin: 'https://tempo.xyz',
					'access-control-request-method': 'POST',
					'access-control-request-headers': 'content-type',
				},
			}),
			context,
		)

		expect(res.status).toBe(204)
		expect(res.headers.get('access-control-allow-origin')).toBe('*')
		expect(res.headers.get('access-control-allow-methods')).toContain('POST')
		expect(res.headers.get('access-control-allow-headers')).toBe(
			'*, Authorization',
		)
	})

	it('allows browsers to read tool responses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('- [Fees](/fees): Pay fees')),
		)
		const res = await handleMcp(
			post(
				{
					jsonrpc: '2.0',
					id: 7,
					method: 'tools/call',
					params: {
						name: 'find_pages',
						arguments: { source: 'viem', query: 'fees' },
					},
				},
				{
					origin: 'https://tempo.xyz',
					accept: 'application/json, text/event-stream',
				},
			),
			context,
		)

		expect(res.headers.get('content-type')).toBe('text/event-stream')
		expect(res.headers.get('access-control-allow-origin')).toBe('*')
	})

	it('reports a missing page resource as not found', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('Not found', { status: 404 })),
		)
		const uri = 'tempo-docs://source/viem/page/docs/missing-protocol-page'
		const res = await handleMcp(
			post({
				jsonrpc: '2.0',
				id: 8,
				method: 'resources/read',
				params: { uri },
			}),
			context,
		)

		expect((await res.json()).error).toEqual({
			code: -32002,
			message: `resource not found: ${uri}`,
		})
	})

	it('reports unexpected handler failures as internal errors', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('network down')
			}),
		)
		const res = await handleMcp(
			post({
				jsonrpc: '2.0',
				id: 9,
				method: 'resources/read',
				params: { uri: 'tempo-docs://source/viem/page/docs/network-failure' },
			}),
			context,
		)

		expect((await res.json()).error).toEqual({
			code: -32603,
			message: 'Internal error',
		})
	})

	it('hides unexpected tool failures from callers', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		const res = await handleMcp(
			post({
				jsonrpc: '2.0',
				id: 10,
				method: 'tools/call',
				params: { name: 'search', arguments: { query: 'search outage' } },
			}),
			{
				...context,
				instance: {
					search: async () => {
						throw new Error('internal AI Search detail')
					},
				} as unknown as AiSearchInstance,
			},
		)

		const body = await res.json()
		expect(body.result.isError).toBe(true)
		expect(JSON.parse(body.result.content[0].text).error).toBe(
			'Docs tool failed. Try again.',
		)
	})
})
