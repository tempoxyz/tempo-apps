import { createFileRoute } from '@tanstack/react-router'
import { getChainId } from 'wagmi/actions'
import { getVerifiedTokenAddresses } from '#lib/server/verified-tokens'
import { getWagmiConfig } from '#wagmi.config.ts'

export type VerifiedTokensApiResponse = {
	chainId: number
	/** Lowercased contract addresses of the chain's verified tokens. */
	addresses: string[]
}

/**
 * The chain's curated verified-token addresses (from the API), consumed by the
 * client-side listed-token membership checks.
 */
export const Route = createFileRoute('/api/verified-tokens')({
	server: {
		handlers: {
			GET: async () => {
				const chainId = getChainId(getWagmiConfig())
				const addresses = await getVerifiedTokenAddresses(chainId)

				return Response.json(
					{
						chainId,
						addresses: [...addresses],
					} satisfies VerifiedTokensApiResponse,
					{
						headers: { 'Cache-Control': 'public, max-age=300' },
					},
				)
			},
		},
	},
})
