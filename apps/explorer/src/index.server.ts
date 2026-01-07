import {
	createStartHandler,
	defaultRenderHandler,
	defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

export const redirects: Array<{
	from: RegExp
	to: (match: RegExpMatchArray) => string
}> = [
	{ from: /^\/blocks\/(latest|\d+)$/, to: (m) => `/block/${m[1]}` },
	{ from: /^\/transaction\/(.+)$/, to: (m) => `/tx/${m[1]}` },
	{ from: /^\/tokens\/(.+)$/, to: (m) => `/token/${m[1]}` },
]

const streamFetch = createStartHandler(defaultStreamHandler)
const renderFetch = createStartHandler(defaultRenderHandler)

export default createServerEntry({
	fetch: async (request, opts) => {
		const url = new URL(request.url)
		const isLocalhost =
			url.hostname === 'localhost' ||
			url.hostname === '127.0.0.1' ||
			url.hostname === '[::1]'
		// In Cloudflare/Vite preview + prerender runs, `process.env.TSS_PRERENDERING`
		// may not propagate into the workerd runtime. Hostname-based detection keeps
		// local builds debuggable and avoids long-lived streaming responses during prerender.
		const isPrerenderLike =
			process.env.TSS_PRERENDERING === 'true' || isLocalhost

		for (const { from, to } of redirects) {
			const match = url.pathname.match(from)
			if (match) {
				url.pathname = to(match)
				return Response.redirect(url, 301)
			}
		}

		try {
			const fetchHandler = isPrerenderLike ? renderFetch : streamFetch

			const handlerOpts = isPrerenderLike ? { ...opts, debug: true } : opts

			return await fetchHandler(request, handlerOpts)
		} catch (error) {
			// During prerendering, failures can be very opaque ("HTTPError").
			// Surface the real error so we can debug build failures.
			const message = error instanceof Error ? error.message : String(error)
			const stack = error instanceof Error ? error.stack : undefined

			if (isPrerenderLike) {
				return new Response(JSON.stringify({ message, stack }), {
					status: 500,
					headers: { 'Content-Type': 'application/json; charset=utf-8' },
				})
			}

			throw error
		}
	},
})
