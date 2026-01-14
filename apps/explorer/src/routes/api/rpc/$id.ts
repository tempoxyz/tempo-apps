import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/rpc/$id')({
	server: {
		handlers: {
			ANY: async ({ request, params }) => {
				const chainId = params.id
				const url = new URL(`/rpc/${chainId}`, 'https://proxy.tempo.xyz')

				const proxyRequest = new Request(url, {
					body: request.body,
					method: request.method,
					headers: request.headers,
				})

				if (env.RPC_PROXY) {
					return env.RPC_PROXY.fetch(proxyRequest)
				}

				return fetch(proxyRequest)
			},
		},
	},
})
