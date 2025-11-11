import handler, { type ServerEntry } from '@tanstack/react-start/server-entry'

export default {
	fetch: (request: Request, opts) => {
		if (import.meta.env.PROD) {
			const authResponse = basicAuth(request)
			if (authResponse) return authResponse
		}

		return handler.fetch(request, opts)
	},
} satisfies ServerEntry

/** @deprecated TODO: remove once we go public */
function basicAuth(request: Request): Response | null {
	const authHeader = request.headers.get('Authorization')

	if (!authHeader)
		return new Response('Unauthorized', {
			status: 401,
			headers: {
				'WWW-Authenticate': 'Basic realm="secure"',
			},
		})

	const [scheme, encoded] = authHeader.split(' ')

	if (scheme !== 'Basic' || !encoded)
		return new Response('Unauthorized', {
			status: 401,
			headers: {
				'WWW-Authenticate': 'Basic realm="secure"',
			},
		})

	const decoded = atob(encoded)
	const [username, password] = decoded.split(':')

	if (
		username !== import.meta.env.BASIC_AUTH_USERNAME ||
		password !== import.meta.env.BASIC_AUTH_PASSWORD
	)
		return new Response('Unauthorized', {
			status: 401,
			headers: {
				'WWW-Authenticate': 'Basic realm="secure"',
			},
		})

	return null
}
