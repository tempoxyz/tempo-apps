import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export const redirects: Array<{
	from: RegExp
	to: (match: RegExpMatchArray) => string
}> = [
	{ from: /^\/blocks\/(latest|\d+)$/, to: (m) => `/block/${m[1]}` },
	{ from: /^\/transaction\/(.+)$/, to: (m) => `/tx/${m[1]}` },
	{ from: /^\/tokens\/(.+)$/, to: (m) => `/token/${m[1]}` },
]

function checkBasicAuth(request: Request): Response | null {
	const basicAuth = process.env.BASIC_AUTH
	if (!basicAuth) return null

	const unauthorized = new Response('Unauthorized', {
		status: 401,
		headers: { 'WWW-Authenticate': 'Basic realm="Explorer"' },
	})

	const authHeader = request.headers.get('Authorization')
	if (!authHeader?.startsWith('Basic ')) return unauthorized

	// 6 = 'Basic '
	try {
		if (atob(authHeader.slice(6)) !== basicAuth) return unauthorized
	} catch {
		return unauthorized
	}

	return null
}

export default createServerEntry({
	fetch: async (request, opts) => {
		const authResponse = checkBasicAuth(request)
		if (authResponse) return authResponse

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
