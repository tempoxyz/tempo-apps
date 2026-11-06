import { afterEach, describe, expect, test, vi } from 'vitest'
import { createPublicClient } from 'viem'
import { tempo, tempoDevnet, tempoModerato } from '@wagmi/core/chains'

import { createRpcTransport, getRpcAuthorizationHeader } from '#lib/rpc.ts'

const env = {
	TEMPO_MAINNET_RPC_AUTH: 'mainnet-client:mainnet-key',
	TEMPO_TESTNET_RPC_AUTH: 'testnet-client:testnet-key',
}

describe('getRpcAuthorizationHeader', () => {
	test('uses the mainnet credentials for Tempo mainnet', () => {
		expect(getRpcAuthorizationHeader(tempo.id, env)).toBe(
			`Basic ${btoa(env.TEMPO_MAINNET_RPC_AUTH)}`,
		)
	})

	test('uses the testnet credentials for Tempo Moderato', () => {
		expect(getRpcAuthorizationHeader(tempoModerato.id, env)).toBe(
			`Basic ${btoa(env.TEMPO_TESTNET_RPC_AUTH)}`,
		)
	})

	test('does not authenticate other chains', () => {
		expect(getRpcAuthorizationHeader(tempoDevnet.id, env)).toBeUndefined()
	})

	test('does not authenticate when the credential is missing', () => {
		expect(getRpcAuthorizationHeader(tempo.id, {})).toBeUndefined()
	})
})

describe('createRpcTransport', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.useRealTimers()
	})

	test('keeps trace authentication and the selected endpoint', async () => {
		const requests: Request[] = []
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
			requests.push(new Request(url, init))
			return Response.json({ jsonrpc: '2.0', id: 1, result: { type: 'CALL' } })
		})
		expect(await traceClient().transport.request(traceRequest)).toEqual({
			type: 'CALL',
		})
		expect(requests).toHaveLength(1)
		expect(requests[0]?.url).toBe('https://rpc.example/')
		expect(requests[0]?.headers.get('authorization')).toBe(
			`Basic ${btoa(env.TEMPO_TESTNET_RPC_AUTH)}`,
		)
	})

	test.each([
		'transport',
		'client',
	] as const)('never retries a trace after a transient failure through %s', async (entry) => {
		let requests = 0
		vi.stubGlobal('fetch', async () => {
			requests++
			return new Response('Unavailable', { status: 503 })
		})
		const client = traceClient()
		const request =
			entry === 'transport' ? client.transport.request : client.request
		await expect(request(traceRequest, { retryCount: 5 })).rejects.toThrow()
		expect(requests).toBe(1)
	})

	test('rejects and cancels an oversized declared trace body before reading it', async () => {
		let canceled = false
		let reads = 0
		vi.stubGlobal(
			'fetch',
			async () =>
				new Response(
					new ReadableStream(
						{
							pull(controller) {
								reads++
								controller.enqueue(new TextEncoder().encode(' '))
								controller.close()
							},
							cancel() {
								canceled = true
							},
						},
						{ highWaterMark: 0 },
					),
					{ headers: { 'content-length': String(256 * 1024 + 1) } },
				),
		)
		await expect(
			traceClient().transport.request(traceRequest),
		).rejects.toThrow()
		expect(reads).toBe(0)
		expect(canceled).toBe(true)
	})

	test.each([
		undefined,
		'1',
	])('stops streaming a large trace at 256 KiB with content-length %s', async (contentLength) => {
		let canceled = false
		let reads = 0
		vi.stubGlobal(
			'fetch',
			async () =>
				new Response(
					new ReadableStream(
						{
							pull(controller) {
								reads++
								if (reads <= 10)
									controller.enqueue(
										new TextEncoder().encode(' '.repeat(64 * 1024)),
									)
								else controller.close()
							},
							cancel() {
								canceled = true
							},
						},
						{ highWaterMark: 0 },
					),
					{ headers: contentLength ? { 'content-length': contentLength } : {} },
				),
		)
		await expect(
			traceClient().transport.request(traceRequest),
		).rejects.toThrow()
		expect(reads).toBe(5)
		expect(canceled).toBe(true)
	})

	test.each([
		'headers',
		'body',
	] as const)('aborts a trace stalled at %s after five seconds', async (stall) => {
		vi.useFakeTimers()
		let signal: AbortSignal | undefined
		let requests = 0
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			requests++
			signal = init.signal ?? undefined
			if (stall === 'headers')
				return new Promise((_resolve, reject) => {
					signal?.addEventListener('abort', () => reject(signal?.reason), {
						once: true,
					})
				})
			return new Response(
				new ReadableStream({
					start(controller) {
						signal?.addEventListener(
							'abort',
							() => controller.error(signal?.reason),
							{ once: true },
						)
					},
				}),
			)
		})
		const result = traceClient()
			.transport.request(traceRequest)
			.then(
				() => 'success',
				() => 'failure',
			)
		await vi.advanceTimersByTimeAsync(5000)
		expect(signal?.aborted).toBe(true)
		expect(await result).toBe('failure')
		expect(requests).toBe(1)
	})

	test('does not lower the byte cap for ordinary RPC responses', async () => {
		const code = `0x${'ab'.repeat(160 * 1024)}` as const
		vi.stubGlobal('fetch', async () =>
			Response.json({ jsonrpc: '2.0', id: 1, result: code }),
		)
		expect(
			await traceClient().getCode({ address: `0x${'11'.repeat(20)}` }),
		).toBe(code)
	})
})

const traceRequest = {
	method: 'debug_traceTransaction',
	params: [`0x${'ab'.repeat(32)}`, { tracer: 'callTracer' }],
} as const

function traceClient() {
	return createPublicClient({
		transport: createRpcTransport('https://rpc.example', tempoModerato.id, env),
	})
}
