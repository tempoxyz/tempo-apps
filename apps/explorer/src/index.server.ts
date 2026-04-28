import * as Sentry from '@sentry/cloudflare'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export const redirects: Array<{
	from: RegExp
	to: (match: RegExpMatchArray) => string
}> = [
	{ from: /^\/blocks\/(latest|\d+)$/, to: (m) => `/block/${m[1]}` },
	{ from: /^\/transaction\/(.+)$/, to: (m) => `/tx/${m[1]}` },
	{ from: /^\/tokens\/(.+)$/, to: (m) => `/token/${m[1]}` },
]

function normalizeApiPath(pathname: string): string {
	return pathname
		.replace(/\/0x[a-fA-F0-9]+/g, '/:hash')
		.replace(/\/\d+/g, '/:id')
}

const SENSITIVE_HEADERS = new Set([
	'authorization',
	'cookie',
	'set-cookie',
	'x-api-key',
	'x-forwarded-for',
])

const SENSITIVE_QUERY_PARAMS = ['auth', 'token', 'apikey', 'api_key', 'key']

function redactHeaders(
	headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
	if (!headers) return headers
	return Object.fromEntries(
		Object.entries(headers).map(([key, value]) => [
			key,
			SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[Filtered]' : value,
		]),
	)
}

function sanitizeUrl(rawUrl: string): string {
	try {
		const url = new URL(rawUrl)
		for (const param of SENSITIVE_QUERY_PARAMS) {
			url.searchParams.delete(param)
		}
		return url.toString()
	} catch {
		return rawUrl
	}
}

const serverEntry = createServerEntry({
	fetch: async (request, opts) => {
		const url = new URL(request.url)

		for (const { from, to } of redirects) {
			const match = url.pathname.match(from)
			if (match) {
				url.pathname = to(match)
				return Response.redirect(url, 301)
			}
		}

		return handler.fetch(request, opts)
	},
})

export default Sentry.withSentry(
	(env: Cloudflare.Env) => ({
		dsn: process.env.SENTRY_DSN,
		release: env.CF_VERSION_METADATA?.id,
		tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE
			? Number(env.SENTRY_TRACES_SAMPLE_RATE)
			: undefined,
		tracePropagationTargets: [/^\//, /tempo\.xyz/],
		sendDefaultPii: false,
		beforeSend: (event) => {
			if (event.request?.url) {
				event.request.url = sanitizeUrl(event.request.url)
			}
			if (event.request?.headers) {
				event.request.headers = redactHeaders(event.request.headers)
			}
			return event
		},
		beforeSendTransaction: (event) => {
			if (event.request?.url) {
				const url = new URL(sanitizeUrl(event.request.url))
				if (url.pathname.startsWith('/api/')) {
					event.transaction = `${event.request.method ?? 'GET'} ${normalizeApiPath(url.pathname)}`
				}
			}
			if (event.request?.headers) {
				event.request.headers = redactHeaders(event.request.headers)
			}
			return event
		},
	}),
	{
		fetch: (request, env, _context) => {
			const processEnv = process.env as Record<string, string | undefined>
			if (env) {
				for (const [key, value] of Object.entries(env)) {
					if (typeof value === 'string') processEnv[key] = value
				}
			}

			return serverEntry.fetch(request, undefined)
		},
	},
)
