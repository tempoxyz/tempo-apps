import { createFileRoute } from '@tanstack/react-router'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { fetchTokenCreatedCount } from '#lib/server/tempo-queries'
import { SIGNET_TOKEN_COUNTS } from '#lib/server/tokens.server'
import { getServerChainId } from '#wagmi.config.ts'

export const Route = createFileRoute('/api/tokens/count')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const chainId = getServerChainId()

					// Return static count for Signet chains
					const signetCount = SIGNET_TOKEN_COUNTS[chainId]
					if (signetCount !== undefined) {
						return Response.json({ data: signetCount, error: null })
					}

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
