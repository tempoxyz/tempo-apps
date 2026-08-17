import { createFileRoute } from '@tanstack/react-router'
import { getChainId } from 'wagmi/actions'
import type { BalancesResponse } from '#lib/address-balances'
import {
	MAX_TOKENS,
	fetchAddressBalancesData,
} from '#lib/server/address-balances'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

export type { BalancesResponse, TokenBalance } from '#lib/address-balances'

export const Route = createFileRoute('/api/address/balances/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const address = zAddress().parse(params.address)
					const chainId = getChainId(getWagmiConfig())
					const response = await fetchAddressBalancesData({
						address,
						chainId,
						maxTokens: MAX_TOKENS,
					})

					return Response.json(response satisfies BalancesResponse)
				} catch (error) {
					console.error(error)
					const errorMessage = error instanceof Error ? error.message : error
					return Response.json(
						{
							balances: [],
							error: String(errorMessage),
						} satisfies BalancesResponse,
						{ status: 500 },
					)
				}
			},
		},
	},
})
