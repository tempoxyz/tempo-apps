import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getExplorerRpcBackend } from '#lib/server/network'
import { forwardRpc } from '#lib/server/rpc'

export const Route = createFileRoute('/api/rpc')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// The Worker entrypoint applies IP, ASN and global limits once.
				try {
					const target = getExplorerRpcBackend(
						import.meta.env.VITE_TEMPO_ENV,
						env.RPC_AUTH,
					)
					return await forwardRpc(request, target)
				} catch {
					return new Response('RPC is not configured', { status: 503 })
				}
			},
		},
	},
})
