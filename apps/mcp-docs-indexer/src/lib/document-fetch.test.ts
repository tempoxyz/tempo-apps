import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSourceDocument, readDocumentText } from './document-fetch.js'

afterEach(() => vi.unstubAllGlobals())

describe('source document boundaries', () => {
	it.each([
		'https://attacker.invalid/body',
		'/outside/body.md',
	])('does not contact an out-of-scope redirect %s', async (location) => {
		const fetcher = vi.fn(
			async () => new Response(null, { status: 302, headers: { location } }),
		)
		vi.stubGlobal('fetch', fetcher)
		await expect(
			fetchSourceDocument(
				'https://example.com/docs/a.md',
				'https://example.com/docs',
				new AbortController().signal,
			),
		).rejects.toThrow('boundary')
		expect(fetcher).toHaveBeenCalledTimes(1)
	})
	it('follows an in-scope relative redirect', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(null, { status: 302, headers: { location: './b.md' } }),
			)
			.mockResolvedValueOnce(new Response('ok'))
		vi.stubGlobal('fetch', fetcher)
		expect(
			await (
				await fetchSourceDocument(
					'https://example.com/docs/a.md',
					'https://example.com/docs',
					new AbortController().signal,
				)
			).text(),
		).toBe('ok')
		expect(String(fetcher.mock.calls[1][0])).toBe(
			'https://example.com/docs/b.md',
		)
	})
	it('cancels oversized chunked documents before parsing', async () => {
		const cancel = vi.fn()
		const response = new Response(
			new ReadableStream({
				pull(controller) {
					controller.enqueue(new Uint8Array(600_000))
				},
				cancel,
			}),
		)
		await expect(readDocumentText(response)).rejects.toThrow('too large')
		expect(cancel).toHaveBeenCalledOnce()
	})
	it('rejects a declared oversized document without reading it', async () => {
		const cancel = vi.fn()
		const response = new Response(new ReadableStream({ cancel }), {
			headers: { 'content-length': '1048577' },
		})
		await expect(readDocumentText(response)).rejects.toThrow('too large')
		expect(cancel).toHaveBeenCalledOnce()
	})
	it('decodes split UTF-8 sequences within the byte budget', async () => {
		const bytes = new TextEncoder().encode('é')
		expect(
			await readDocumentText(
				new Response(
					new ReadableStream({
						start(c) {
							c.enqueue(bytes.subarray(0, 1))
							c.enqueue(bytes.subarray(1))
							c.close()
						},
					}),
				),
			),
		).toBe('é')
	})
})
