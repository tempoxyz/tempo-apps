import { createFileRoute } from '@tanstack/react-router'
import { getChainId } from 'wagmi/actions'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import {
	fetchTokenCreatedCount,
	fetchTokenCreatedRows,
} from '#lib/server/tempo-queries'
import { getTokenListAddresses } from '#lib/server/tokens'
import { getWagmiConfig } from '#wagmi.config.ts'

const SPAM_TOKEN_PATTERN = /\btest|test\b|\bfake|fake\b/i

/** Mainnet chain ID */
const TEMPO_MAINNET_CHAIN_ID = 4217

/** Devnet chain ID – TIDX does not index devnet */
const TEMPO_DEVNET_CHAIN_ID = 31318

export const Route = createFileRoute('/api/tokens/count')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const config = getWagmiConfig()
					const chainId = getChainId(config)

					// Devnet: tokenlist only (TIDX does not index devnet)
					if (chainId === TEMPO_DEVNET_CHAIN_ID) {
						const addresses = await getTokenListAddresses(chainId)
						return Response.json({ data: addresses.size, error: null })
					}

					if (chainId === TEMPO_MAINNET_CHAIN_ID) {
						// Mainnet: only tokenlist tokens (filter TIDX to tokenlist)
						const [tokenListAddresses, allTokens] = await Promise.all([
							getTokenListAddresses(chainId),
							fetchTokenCreatedRows(chainId, TOKEN_COUNT_MAX, 0),
						])
						const count = allTokens.filter(
							(row) =>
								tokenListAddresses.has(row.token.toLowerCase()) &&
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
