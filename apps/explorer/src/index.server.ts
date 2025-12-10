import * as Sentry from '@sentry/cloudflare'
import handler, { type ServerEntry } from '@tanstack/react-start/server-entry'

export default Sentry.withSentry(
	(env: Cloudflare.Env) => {
		const { id: versionId } = env.CF_VERSION_METADATA
		return {
			dsn: 'https://170113585c24ca7a67704f86cccd6750@o4510262603481088.ingest.us.sentry.io/4510467689218048',
			release: versionId,
			// Adds request headers and IP for users, for more info visit:
			// https://docs.sentry.io/platforms/javascript/guides/cloudflare/configuration/options/#sendDefaultPii
			sendDefaultPii: true,
		}
	},
	{
		fetch: (request: Request, opts) => {
			const url = new URL(request.url)
			if (url.pathname === '/debug-sentry')
				throw new Error('My first Sentry error!')

			return handler.fetch(request, opts as Parameters<ServerEntry['fetch']>[1])
		},
	},
)
