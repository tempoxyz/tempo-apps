import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export const RPC_AUTH_COOKIE = 'rpc_auth'

export const redirects: Array<{
	from: RegExp
	to: (match: RegExpMatchArray) => string
}> = [
	{ from: /^\/blocks\/(latest|\d+)$/, to: (m) => `/block/${m[1]}` },
	{ from: /^\/transaction\/(.+)$/, to: (m) => `/tx/${m[1]}` },
	{ from: /^\/tokens\/(.+)$/, to: (m) => `/token/${m[1]}` },
]

function getRpcAuthFromCookie(request: Request): string | null {
	const cookies = request.headers.get('cookie')
	if (!cookies) return null
	const prefix = `${RPC_AUTH_COOKIE}=`
	const cookie = cookies.split('; ').find((c) => c.startsWith(prefix))
	if (!cookie) return null
	return `Basic ${cookie.slice(prefix.length)}`
}

function handleAuthParam(request: Request): Response | null {
	const url = new URL(request.url)
	const auth = url.searchParams.get('auth')
	if (!auth) return null

	url.searchParams.delete('auth')
	return new Response(null, {
		status: 302,
		headers: {
			Location: url.toString(),
			'Set-Cookie': `${RPC_AUTH_COOKIE}=${auth.includes(':') ? btoa(auth) : auth}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`,
		},
	})
}

async function checkRpcAuth(request: Request): Promise<Response | null> {
	if (process.env.FORWARD_RPC_AUTH !== '1') return null

	const rpcUrl = process.env.VITE_TEMPO_RPC_HTTP
	if (!rpcUrl) return null

	const unauthorized = new Response('Unauthorized', {
		status: 401,
		headers: { 'WWW-Authenticate': 'Basic realm="Explorer"' },
	})

	const authHeader =
		request.headers.get('Authorization') ?? getRpcAuthFromCookie(request)
	if (!authHeader) return unauthorized

	try {
		const response = await fetch(rpcUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: authHeader,
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'eth_chainId',
				params: [],
				id: 1,
			}),
		})
		if (!response.ok) return unauthorized
	} catch {
		return unauthorized
	}

	return null
}

export default createServerEntry({
	fetch: async (request, opts) => {
		const authParamResponse = handleAuthParam(request)
		if (authParamResponse) return authParamResponse

		const authResponse = await checkRpcAuth(request)
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
