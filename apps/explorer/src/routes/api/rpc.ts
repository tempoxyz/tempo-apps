import { createFileRoute } from '@tanstack/react-router'
import { tempoMainnet, tempoTestnet } from '#lib/chains'
import { serverEnv, tempoApiUrl } from '#lib/server/env'
import { getTempoChain } from '#wagmi.config.ts'

const RPC_PROXY_URL = 'https://proxy.tempo.xyz/rpc'

/**
 * Same-origin JSON-RPC proxy for browser traffic. Keeps RPC credentials
 * server-side and puts RPC calls behind the worker's per-IP rate limiting.
 */
export const Route = createFileRoute('/api/rpc')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = await request.text()
				if (!body) return new Response(null, { status: 400 })

				const { id: chainId } = getTempoChain()

				// Tempo API RPC passthrough (mainnet + testnet; requires an API key).
				const upstream: { url: string; headers: Record<string, string> } =
					serverEnv.TEMPO_API_KEY &&
					(chainId === tempoMainnet.id || chainId === tempoTestnet.id)
						? {
								url: `${tempoApiUrl}/rpc/${chainId}`,
								headers: { 'tempo-api-key': serverEnv.TEMPO_API_KEY },
							}
						: {
								// Shared proxy injects env RPC keys for allowlisted origins.
								url: `${RPC_PROXY_URL}/${chainId}`,
								headers: { origin: new URL(request.url).origin },
							}

				try {
					const response = await fetch(upstream.url, {
						method: 'POST',
						headers: {
							'content-type': 'application/json',
							...upstream.headers,
						},
						body,
					})

					// Upstream 401 means the worker's credential failed; surface as
					// a gateway error rather than an auth challenge for the browser.
					if (response.status === 401)
						return Response.json(
							{ error: 'Upstream RPC unavailable' },
							{ status: 502 },
						)

					// Buffered (not streamed) to keep response framing simple.
					const result = await response.text()
					return new Response(result, {
						status: response.status,
						headers: {
							'content-type':
								response.headers.get('content-type') ?? 'application/json',
						},
					})
				} catch {
					return Response.json(
						{ error: 'Upstream RPC unavailable' },
						{ status: 502 },
					)
				}
			},
		},
	},
})
