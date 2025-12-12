import * as Sentry from '@sentry/cloudflare'
import handler, { type ServerEntry } from '@tanstack/react-start/server-entry'

const OG_BASE_URL = 'https://og.porto.workers.dev'

// Inject OG meta tags for transaction pages (for social media crawlers)
class OgMetaInjector {
	private ogImageUrl: string
	private title: string

	constructor(ogImageUrl: string, title: string) {
		this.ogImageUrl = ogImageUrl
		this.title = title
	}

	element(element: Element) {
		// Inject OG meta tags at the end of <head>
		element.append(
			`<meta property="og:title" content="${this.title}" />`,
			{ html: true },
		)
		element.append(
			`<meta property="og:image" content="${this.ogImageUrl}" />`,
			{ html: true },
		)
		element.append('<meta property="og:image:type" content="image/png" />', {
			html: true,
		})
		element.append('<meta property="og:image:width" content="1200" />', {
			html: true,
		})
		element.append('<meta property="og:image:height" content="630" />', {
			html: true,
		})
		element.append('<meta name="twitter:card" content="summary_large_image" />', {
			html: true,
		})
		element.append(
			`<meta name="twitter:image" content="${this.ogImageUrl}" />`,
			{ html: true },
		)
	}
}

function buildBasicOgUrl(hash: string): string {
	// Build a basic OG URL - the OG worker will fetch full data if needed
	return `${OG_BASE_URL}/tx/${hash}`
}

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

			// Check if this is a transaction page and inject OG meta tags
			const txMatch = url.pathname.match(/^\/tx\/0x[a-fA-F0-9]{64}$/)
			if (txMatch && response.headers.get('content-type')?.includes('text/html')) {
				const hash = url.pathname.split('/tx/')[1]
				const ogImageUrl = buildBasicOgUrl(hash)
				const title = `Transaction ${hash.slice(0, 10)}...${hash.slice(-6)} ⋅ Tempo Explorer`

				// Use HTMLRewriter to inject OG meta tags
				return new HTMLRewriter()
					.on('head', new OgMetaInjector(ogImageUrl, title))
					.transform(response)
			}

			return response
		},
	},
)
