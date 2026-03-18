import { createFileRoute } from '@tanstack/react-router'
import { getChainId } from 'wagmi/actions'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import {
	fetchTokenCreatedCount,
	fetchTokenCreatedRows,
} from '#lib/server/tempo-queries'
import { getWagmiConfig } from '#wagmi.config.ts'

const SPAM_TOKEN_PATTERN = /\btest|test\b|\bfake|fake\b/i

/** Mainnet chain ID */
const TEMPO_MAINNET_CHAIN_ID = 4217

export const Route = createFileRoute('/api/tokens/count')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const config = getWagmiConfig()
					const chainId = getChainId(config)

					if (chainId === TEMPO_MAINNET_CHAIN_ID) {
						// Fetch all tokens up to cap and count non-spam ones
						const allTokens = await fetchTokenCreatedRows(
							chainId,
							TOKEN_COUNT_MAX,
							0,
						)
						const count = allTokens.filter(
							(row) =>
								!SPAM_TOKEN_PATTERN.test(row.name) &&
								!SPAM_TOKEN_PATTERN.test(row.symbol),
						).length

						return Response.json({ data: count, error: null })
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
