import { createFileRoute } from '@tanstack/react-router'
import { getChainId } from 'wagmi/actions'
import { getRequestURL, hasIndexSupply } from '#lib/env'
import type { BalancesResponse } from '#lib/address-balances'
import {
	MAX_TOKENS,
	createBalancesCsvResponse,
	fetchAddressBalancesData,
} from '#lib/server/address-balances'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

export type { BalancesResponse, TokenBalance } from '#lib/address-balances'

export const Route = createFileRoute('/api/address/balances/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!hasIndexSupply())
					return Response.json({ balances: [] } satisfies BalancesResponse)

				try {
					const url = getRequestURL()
					const isCsvExport = url.searchParams.get('format') === 'csv'
					const address = zAddress().parse(params.address)
					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const response = await fetchAddressBalancesData({
						address,
						chainId,
						config,
						maxTokens: MAX_TOKENS,
					})

					if (!isCsvExport) {
						return Response.json(response satisfies BalancesResponse)
					}

					return createBalancesCsvResponse({
						address,
						balances: response.balances,
					})
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
