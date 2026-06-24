import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { serverEnv, tempoApiUrl } from '#lib/server/env'
import { getTempoChain } from '#wagmi.config.ts'

/**
 * Same-origin proxy for the Tempo API's curated token logo
 * (`/v1/tokens/:address/logo`). Keeps the backend host + API key server-side
 * and lets the edge cache the SVG, replacing the former tokenlist icon CDN.
 */
export const Route = createFileRoute('/api/token/logo/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!Address.validate(params.address))
					return new Response(null, { status: 400 })
				const address = params.address.toLowerCase()

				const { id: chainId } = getTempoChain()
				const url = `${tempoApiUrl}/v1/tokens/${address}/logo?chainId=${chainId}`

				const upstream = await fetch(url, {
					headers: serverEnv.TEMPO_API_KEY
						? { 'tempo-api-key': serverEnv.TEMPO_API_KEY }
						: undefined,
				}).catch(() => undefined)

				if (!upstream?.ok) return new Response(null, { status: 404 })

				return new Response(upstream.body, {
					status: 200,
					headers: {
						'Content-Type':
							upstream.headers.get('Content-Type') ?? 'image/svg+xml',
						'Cache-Control':
							'public, max-age=86400, stale-while-revalidate=604800',
					},
				})
			},
		},
	},
})
