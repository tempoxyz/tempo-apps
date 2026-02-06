import { createFileRoute } from '@tanstack/react-router'
import { getChainId } from 'wagmi/actions'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { fetchTokenCreatedCount } from '#lib/server/tempo-queries'
import { getWagmiConfig } from '#wagmi.config.ts'

export const Route = createFileRoute('/api/tokens/count')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const count = await fetchTokenCreatedCount(chainId, TOKEN_COUNT_MAX)

					return Response.json({ data: count, error: null })
				} catch (error) {
					console.error(error)
					const errorMessage = error instanceof Error ? error.message : error
					return Response.json(
						{ data: null, error: errorMessage },
						{ status: 500 },
					)
				}
			},
		},
	},
})
