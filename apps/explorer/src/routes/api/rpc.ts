import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getExplorerRpcBackend } from '#lib/server/network'
import { forwardProverRpc } from '#lib/server/prover-rpc'
import { forwardRpc } from '#lib/server/rpc'
import { ZONE_PROVER_CHAIN_ID } from '#lib/zone-prover'

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
					if (target.chainId === ZONE_PROVER_CHAIN_ID)
						return await forwardProverRpc(request, target.headers.Authorization)
					return await forwardRpc(request, target)
				} catch {
					return new Response('RPC is not configured', { status: 503 })
				}
			},
		},
	},
})
