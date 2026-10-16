import type { JsonRpcRequest } from './mcp.js'

export const MAX_MCP_REQUEST_BYTES = 1024 * 1024

/** Bound POST bodies before parsing, retaining their bytes for proxy fallback. */
export async function readMcpRequest(
	req: Request,
): Promise<{ request: Request; body?: JsonRpcRequest } | Response> {
	if (req.method !== 'POST') return { request: req }
	if (Number(req.headers.get('content-length')) > MAX_MCP_REQUEST_BYTES) {
		void req.body?.cancel().catch(() => undefined)
		return new Response('Request body too large', { status: 413 })
	}
	if (!req.body) return { request: req }

	const reader = req.body.getReader()
	let buffer = new Uint8Array(0)
	let size = 0
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			const nextSize = size + value.byteLength
			if (nextSize > MAX_MCP_REQUEST_BYTES) {
				void reader.cancel().catch(() => undefined)
				return new Response('Request body too large', { status: 413 })
			}
			if (nextSize > buffer.byteLength) {
				const expanded = new Uint8Array(
					Math.min(
						MAX_MCP_REQUEST_BYTES,
						Math.max(8192, nextSize, buffer.byteLength * 2),
					),
				)
				expanded.set(buffer)
				buffer = expanded
			}
			buffer.set(value, size)
			size = nextSize
		}
	} finally {
		reader.releaseLock()
	}
	const bytes = buffer.subarray(0, size)

	const request = new Request(req, { body: bytes })
	try {
		const body = JSON.parse(new TextDecoder().decode(bytes))
		if (body && typeof body === 'object' && !Array.isArray(body))
			return { request, body }
	} catch {
		// Let the upstream handle malformed JSON, preserving the original bytes.
	}
	return { request }
}
