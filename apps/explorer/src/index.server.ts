import * as Sentry from '@sentry/cloudflare'
import handler, { type ServerEntry } from '@tanstack/react-start/server-entry'
import {
	buildAddressOgData,
	buildTokenOgData,
	buildTxOgData,
	OgMetaInjector,
	OgMetaRemover,
} from '#lib/og.ts'

export default Sentry.withSentry(
	(env: Cloudflare.Env) => {
		const metadata = env.CF_VERSION_METADATA
		return {
			dsn: 'https://170113585c24ca7a67704f86cccd6750@o4510262603481088.ingest.us.sentry.io/4510467689218048',
			release: metadata.id,
			// Adds request headers and IP for users, for more info visit:
			// https://docs.sentry.io/platforms/javascript/guides/cloudflare/configuration/options/#sendDefaultPii
			sendDefaultPii: true,
			enableLogs: true,
		}
	},
	{
		fetch: async (request: Request, opts) => {
			const url = new URL(request.url)
			if (url.pathname === '/debug-sentry')
				throw new Error('My first Sentry error!')

			// Get the response from the app
			const response = await handler.fetch(
				request,
				opts as Parameters<ServerEntry['fetch']>[1],
			)

			// Check if this is a transaction or receipt page and inject OG meta tags
			const txMatch = url.pathname.match(/^\/(tx|receipt)\/0x[a-fA-F0-9]{64}$/)
			if (
				txMatch &&
				response.headers.get('content-type')?.includes('text/html')
			) {
				const pathParts = url.pathname.split('/')
				const hash = pathParts[2] // Gets the hash from /tx/{hash} or /receipt/{hash}
				const ogData = await buildTxOgData(hash)
				const title = `Transaction ${hash.slice(0, 6)}...${hash.slice(-4)} ⋅ Tempo Explorer`

				// Use HTMLRewriter to remove existing OG tags and inject transaction-specific ones
				return new HTMLRewriter()
					.on('meta', new OgMetaRemover())
					.on('head', new OgMetaInjector(ogData.url, title, ogData.description))
					.transform(response)
			}

			// Check if this is a token page and inject OG meta tags
			// Handle both 200 responses and redirects (307) for token pages
			const tokenMatch = url.pathname.match(/^\/token\/0x[a-fA-F0-9]{40}$/)
			if (tokenMatch) {
				const address = url.pathname.split('/token/')[1]
				const ogData = await buildTokenOgData(address)
				const title = `Token ${address.slice(0, 6)}...${address.slice(-4)} ⋅ Tempo Explorer`

				// For redirects, return HTML with OG tags that will redirect client-side
				if (response.status >= 300 && response.status < 400) {
					const redirectUrl = response.headers.get('location') || '/'
					const html = `<!DOCTYPE html><html><head>
						<meta property="og:title" content="${title}" />
						<meta property="og:description" content="${ogData.description}" />
						<meta property="og:image" content="${ogData.url}" />
						<meta property="og:image:type" content="image/png" />
						<meta property="og:image:width" content="1200" />
						<meta property="og:image:height" content="630" />
						<meta name="twitter:card" content="summary_large_image" />
						<meta name="twitter:image" content="${ogData.url}" />
						<meta http-equiv="refresh" content="0;url=${redirectUrl}" />
					</head><body></body></html>`
					return new Response(html, {
						status: 200,
						headers: { 'Content-Type': 'text/html; charset=utf-8' },
					})
				}

				// For normal HTML responses, use HTMLRewriter
				if (response.headers.get('content-type')?.includes('text/html')) {
					return new HTMLRewriter()
						.on('meta', new OgMetaRemover())
						.on(
							'head',
							new OgMetaInjector(ogData.url, title, ogData.description),
						)
						.transform(response)
				}
			}

			// Check if this is an address page and inject OG meta tags
			const addressMatch = url.pathname.match(/^\/address\/0x[a-fA-F0-9]{40}$/)
			if (
				addressMatch &&
				response.headers.get('content-type')?.includes('text/html')
			) {
				const address = url.pathname.split('/address/')[1]
				const ogData = await buildAddressOgData(address)
				const label = ogData.isContract ? 'Contract' : 'Address'
				const title = `${label} ${address.slice(0, 6)}...${address.slice(-4)} ⋅ Tempo Explorer`

				// Use HTMLRewriter to remove existing OG tags and inject address-specific ones
				return new HTMLRewriter()
					.on('meta', new OgMetaRemover())
					.on('head', new OgMetaInjector(ogData.url, title, ogData.description))
					.transform(response)
			}

			return response
		},
	},
)
