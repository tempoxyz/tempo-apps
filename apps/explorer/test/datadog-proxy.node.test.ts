import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleDatadogProxy } from '../src/lib/server/datadog-proxy'

const env = process.env as Record<string, string | undefined>

let previousApplicationId: string | undefined
let previousClientToken: string | undefined
let previousSite: string | undefined

beforeEach(() => {
	previousApplicationId = env.DATADOG_APPLICATION_ID
	previousClientToken = env.DATADOG_CLIENT_TOKEN
	previousSite = env.DATADOG_SITE
	env.DATADOG_APPLICATION_ID = 'real-application-id'
	env.DATADOG_CLIENT_TOKEN = 'real-token'
	env.DATADOG_SITE = 'us5.datadoghq.com'
})

afterEach(() => {
	env.DATADOG_APPLICATION_ID = previousApplicationId
	env.DATADOG_CLIENT_TOKEN = previousClientToken
	env.DATADOG_SITE = previousSite
	vi.unstubAllGlobals()
})

describe('Datadog proxy', () => {
	it.each([
		undefined,
		'1',
		'invalid',
	])('rejects oversized streams with content-length %s before reading the rest', async (contentLength) => {
		const fetch = vi.fn<typeof globalThis.fetch>()
		vi.stubGlobal('fetch', fetch)
		const cancel = vi.fn()
		let reads = 0
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					reads++
					controller.enqueue(new Uint8Array(reads === 1 ? 10_000_000 : 1))
				},
				cancel,
			},
			{ highWaterMark: 0 },
		)
		const url = new URL('https://explore.tempo.xyz/dd-proxy')
		url.searchParams.set(
			'ddforward',
			'/api/v2/rum?dd-api-key=explorer-dd-proxy',
		)
		const request = new Request(url, {
			body,
			duplex: 'half',
			headers: contentLength ? { 'content-length': contentLength } : {},
			method: 'POST',
		} as RequestInit)

		const res = await handleDatadogProxy(request)

		expect(res.status).toBe(413)
		expect(await res.text()).toBe('Payload too large')
		expect(reads).toBe(2)
		expect(cancel).toHaveBeenCalledOnce()
		expect(body.locked).toBe(false)
		expect(fetch).not.toHaveBeenCalled()
	})

	it.each([
		10_000_000, 10_000_001,
	])('enforces the byte limit for a %i-byte UTF-8 batch', async (size) => {
		const fetch = vi.fn<typeof globalThis.fetch>(
			async () => new Response('ok', { status: 202 }),
		)
		vi.stubGlobal('fetch', fetch)
		const event = JSON.stringify({
			application: { id: '00000000-0000-0000-0000-000000000000' },
			message: 'é',
		})
		const encoded = new TextEncoder().encode(event)
		const payload = new Uint8Array(size).fill(32)
		payload.set(encoded)
		const split = encoded.indexOf(0xc3) + 1
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(payload.subarray(0, split))
				controller.enqueue(payload.subarray(split))
				controller.close()
			},
		})
		const url = new URL('https://explore.tempo.xyz/dd-proxy')
		url.searchParams.set(
			'ddforward',
			'/api/v2/rum?dd-api-key=explorer-dd-proxy',
		)
		const request = new Request(url, {
			body,
			duplex: 'half',
			method: 'POST',
		} as RequestInit)

		const res = await handleDatadogProxy(request)

		expect(res.status).toBe(size === 10_000_000 ? 202 : 413)
		if (size === 10_000_000) {
			expect(fetch).toHaveBeenCalledOnce()
			expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
				application: { id: 'real-application-id' },
				message: 'é',
			})
		} else {
			expect(fetch).not.toHaveBeenCalled()
		}
	})

	it('forwards RUM batches to the configured Datadog site', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(
			async () => new Response('ok', { status: 202 }),
		)
		vi.stubGlobal('fetch', fetch)

		const url = new URL('https://explore.tempo.xyz/dd-proxy')
		url.searchParams.set(
			'ddforward',
			'/api/v2/rum?ddsource=browser&dd-api-key=explorer-dd-proxy',
		)

		const res = await handleDatadogProxy(
			new Request(url, {
				body: [
					JSON.stringify({
						application: { id: '00000000-0000-0000-0000-000000000000' },
						type: 'view',
					}),
					JSON.stringify({
						application: { id: '00000000-0000-0000-0000-000000000000' },
						type: 'resource',
					}),
				].join('\n'),
				headers: {
					authorization: 'Bearer should-not-forward',
					'cf-connecting-ip': '203.0.113.10',
					'content-type': 'text/plain',
					cookie: 'session=secret',
				},
				method: 'POST',
			}),
		)

		const call = fetch.mock.calls[0]
		expect(call).toBeDefined()
		if (!call) throw new Error('Expected Datadog intake fetch')
		const [input, init] = call
		const headers = Object.fromEntries(new Headers(init?.headers).entries())
		const body = String(init?.body)

		expect({
			forwardedUrl: String(input),
			hasAuthorization: 'authorization' in headers,
			hasCookie: 'cookie' in headers,
			host: headers.host,
			ip: headers['x-forwarded-for'],
			method: init?.method,
			responseStatus: res.status,
			rewrittenApplicationIds: body
				.split('\n')
				.map((line) => JSON.parse(line).application.id as string),
			usesPlaceholderToken: String(input).includes('explorer-dd-proxy'),
		}).toMatchInlineSnapshot(`
			{
			  "forwardedUrl": "https://browser-intake-us5-datadoghq.com/api/v2/rum?ddsource=browser&dd-api-key=real-token",
			  "hasAuthorization": false,
			  "hasCookie": false,
			  "host": "browser-intake-us5-datadoghq.com",
			  "ip": "203.0.113.10",
			  "method": "POST",
			  "responseStatus": 202,
			  "rewrittenApplicationIds": [
			    "real-application-id",
			    "real-application-id",
			  ],
			  "usesPlaceholderToken": false,
			}
		`)
	})

	it('rejects invalid forwarding inputs', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>()
		vi.stubGlobal('fetch', fetch)

		const cases = await Promise.all([
			handleDatadogProxy(new Request('https://explore.tempo.xyz/dd-proxy')),
			handleDatadogProxy(
				new Request(
					'https://explore.tempo.xyz/dd-proxy?ddforward=https://evil.example/api/v2/rum',
					{ method: 'POST' },
				),
			),
			handleDatadogProxy(
				new Request(
					'https://explore.tempo.xyz/dd-proxy?ddforward=/api/v2/logs',
					{ method: 'POST' },
				),
			),
			handleDatadogProxy(
				new Request(
					'https://explore.tempo.xyz/dd-proxy?ddforward=/api/v2/rum&ddforwardSubdomain=quota',
					{ method: 'POST' },
				),
			),
		])

		expect(cases.map((res) => res.status)).toMatchInlineSnapshot(`
			[
			  405,
			  400,
			  400,
			  400,
			]
		`)
		expect(fetch).not.toHaveBeenCalled()
	})

	it('rejects batches for a different Datadog client token', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>()
		vi.stubGlobal('fetch', fetch)

		const url = new URL('https://explore.tempo.xyz/dd-proxy')
		url.searchParams.set(
			'ddforward',
			'/api/v2/rum?ddsource=browser&dd-api-key=other',
		)

		const res = await handleDatadogProxy(
			new Request(url, {
				body: JSON.stringify({
					application: { id: '00000000-0000-0000-0000-000000000000' },
					type: 'view',
				}),
				method: 'POST',
			}),
		)

		expect({
			calledFetch: fetch.mock.calls.length,
			status: res.status,
		}).toMatchInlineSnapshot(`
				{
				  "calledFetch": 0,
				  "status": 403,
				}
			`)
	})

	it('rejects batches without the placeholder application ID', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>()
		vi.stubGlobal('fetch', fetch)

		const url = new URL('https://explore.tempo.xyz/dd-proxy')
		url.searchParams.set(
			'ddforward',
			'/api/v2/rum?ddsource=browser&dd-api-key=explorer-dd-proxy',
		)

		const res = await handleDatadogProxy(
			new Request(url, {
				body: JSON.stringify({
					application: { id: 'other-application-id' },
					type: 'view',
				}),
				method: 'POST',
			}),
		)

		expect({
			calledFetch: fetch.mock.calls.length,
			status: res.status,
		}).toMatchInlineSnapshot(`
				{
				  "calledFetch": 0,
				  "status": 400,
				}
			`)
	})
})
