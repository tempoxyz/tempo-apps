import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { getChainBackend } from '#lib/server/network'
import { getTempoChain } from '#wagmi.config'
import { forwardProverRpc } from '#lib/server/prover-rpc'
import { checkRateLimit } from '#lib/server/rate-limit'

export const Route = createFileRoute('/api/rpc')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const limited = await checkRateLimit(request, {
					ip: env.REQUESTS_RATE_LIMITER,
					asn: env.ASN_RATE_LIMITER,
					global: env.GLOBAL_RATE_LIMITER,
				})
				if (limited) return limited
				try {
					const target = getChainBackend(getTempoChain().id, 'rpc')
					if (!target) return new Response(null, { status: 404 })
					return await forwardProverRpc(request, target.headers.Authorization)
				} catch {
					return new Response('Prover RPC is not configured', { status: 503 })
				}
			},
		},
	},
})
