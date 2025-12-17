import * as Sentry from '@sentry/cloudflare'
import handler, { type ServerEntry } from '@tanstack/react-start/server-entry'

export const redirects: Array<{
	from: RegExp
	to: (match: RegExpMatchArray) => string
}> = [
	{ from: /^\/blocks\/(latest|\d+)$/, to: (m) => `/block/${m[1]}` },
	{ from: /^\/transaction\/(.+)$/, to: (m) => `/tx/${m[1]}` },
	{ from: /^\/tokens\/(.+)$/, to: (m) => `/token/${m[1]}` },
]

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
		fetch: (request: Request, opts) => {
			const url = new URL(request.url)
			if (url.pathname === '/debug-sentry')
				throw new Error('My first Sentry error!')

			for (const { from, to } of redirects) {
				const match = url.pathname.match(from)
				if (match) {
					url.pathname = to(match)
					return Response.redirect(url, 301)
				}
			}

			return handler.fetch(request, opts as Parameters<ServerEntry['fetch']>[1])
		},
	},
)
