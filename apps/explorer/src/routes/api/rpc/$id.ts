import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/rpc/$id')({
	server: {
		handlers: {
			ANY: async ({ request, params }) => {
				const chainId = params.id
				const url = new URL(`/rpc/${chainId}`, request.url)

				const proxyRequest = new Request(url, {
					body: request.body,
					method: request.method,
					headers: request.headers,
				})

				const response = await env.RPC_PROXY.fetch(proxyRequest)
				return response
			},
		},
	},
})
