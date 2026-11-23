import { resolveSourcePageUrl } from './sources.js'

const MAX_DOCUMENT_BYTES = 1024 * 1024

/** Fetch only within the source boundary, checking each redirect before contacting its target. */
export async function fetchSourceDocument(
	url: string,
	base: string,
	signal: AbortSignal,
	headers?: HeadersInit,
): Promise<Response> {
	let target = new URL(url)
	for (let hop = 0; hop <= 3; hop++) {
		const allowed = resolveSourcePageUrl(target.href, base)
		if (
			!allowed ||
			allowed.origin !== target.origin ||
			allowed.pathname !== target.pathname
		)
			throw new Error('Document outside source boundary')
		const response = await fetch(target.toString(), {
			signal,
			headers,
			redirect: 'manual',
			cf: { cacheTtl: 60 },
		})
		if (response.status < 300 || response.status >= 400) return response
		await response.body?.cancel()
		const location = response.headers.get('location')
		if (!location || hop === 3)
			throw new Error('Document redirect limit exceeded')
		target = new URL(location, target)
	}
	throw new Error('Document redirect limit exceeded')
}

/** Bound decoded response bytes before assembling or parsing external document text. */
export async function readDocumentText(response: Response): Promise<string> {
	if (Number(response.headers.get('content-length')) > MAX_DOCUMENT_BYTES) {
		await response.body?.cancel()
		throw new Error('Document too large')
	}
	const reader = response.body?.getReader()
	if (!reader) return ''
	const decoder = new TextDecoder()
	let bytes = 0
	let text = ''
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			bytes += value.byteLength
			if (bytes > MAX_DOCUMENT_BYTES) throw new Error('Document too large')
			text += decoder.decode(value, { stream: true })
		}
		return text + decoder.decode()
	} finally {
		await reader.cancel()
		reader.releaseLock()
	}
}
