import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

function checkBasicAuth(request: Request): Response | null {
	const basicAuth = process.env.BASIC_AUTH
	if (!basicAuth) return null

	const authHeader = request.headers.get('Authorization')
	if (!authHeader || !authHeader.startsWith('Basic ')) {
		return new Response('Unauthorized', {
			status: 401,
			headers: { 'WWW-Authenticate': 'Basic realm="App"' },
		})
	}

	const credentials = atob(authHeader.slice(6))
	if (credentials !== basicAuth) {
		return new Response('Unauthorized', {
			status: 401,
			headers: { 'WWW-Authenticate': 'Basic realm="App"' },
		})
	}

	return null
}

export default createServerEntry({
	fetch: async (request, opts) => {
		const authResponse = checkBasicAuth(request)
		if (authResponse) return authResponse

		return handler.fetch(request, opts)
	},
})
