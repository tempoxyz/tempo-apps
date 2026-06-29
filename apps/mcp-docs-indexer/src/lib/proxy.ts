import { recordProxyFallback } from './metrics.js'

/**
 * Transparent proxy from this worker (mcp.tempo.xyz) to the Cloudflare AI
 * Search MCP endpoint. AI Search assigns each instance an opaque hostname
 * like `<uuid>.search.ai.cloudflare.com`; we surface a stable, brandable
 * URL by forwarding the request 1:1 (method, headers, body, response stream).
 *
 * Notes:
 * - Preserves the incoming path so /mcp, /sse, etc. all forward correctly.
 * - Streams responses so MCP server-sent events flow through untouched.
 * - Does not add auth: the upstream AI Search MCP endpoint is public.
 */
export async function proxyMcp(
	req: Request,
	upstreamBase: string,
): Promise<Response> {
	const startedAt = performance.now()
	const incoming = new URL(req.url)
	const upstream = new URL(upstreamBase)
	// Keep upstream base path if it has one (e.g. ".../mcp"); otherwise
	// forward the incoming path verbatim. We compose by appending the
	// incoming path to the upstream origin if the upstream URL is just an
	// origin, or replace the path if it's a specific endpoint.
	const target =
		upstream.pathname === '/' || upstream.pathname === ''
			? new URL(incoming.pathname + incoming.search, upstream.origin)
			: new URL(upstream.toString())

	const headers = new Headers(req.headers)
	headers.delete('host')
	// Drop hop-by-hop and Cloudflare-specific headers that should not be
	// forwarded blindly to a different origin.
	headers.delete('cf-connecting-ip')
	headers.delete('cf-ipcountry')
	headers.delete('cf-ray')
	headers.delete('cf-visitor')
	headers.delete('x-forwarded-for')
	headers.delete('x-forwarded-proto')
	headers.delete('x-real-ip')

	const init: RequestInit = {
		method: req.method,
		headers,
		redirect: 'manual',
	}
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		init.body = req.body
	}

	try {
		const response = await fetch(target.toString(), init)
		recordProxyFallback(
			response.status,
			Math.round(performance.now() - startedAt),
		)
		return response
	} catch (error) {
		recordProxyFallback(500, Math.round(performance.now() - startedAt))
		throw error
	}
}
