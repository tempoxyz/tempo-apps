import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { getRequestURL } from '#lib/env'
import {
	MAX_LIMIT,
	RequestParametersSchema,
	fetchAddressHistoryData,
	type HistoryResponse,
} from '#lib/server/address-history'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

export type {
	EnrichedTransaction,
	HistoryRequestParameters,
	HistoryResponse,
} from '#lib/server/address-history'

export const Route = createFileRoute('/api/address/history/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const url = getRequestURL()
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const parseParams = RequestParametersSchema.safeParse(
						Object.fromEntries(url.searchParams),
					)
					if (!parseParams.success)
						return Response.json(
							{ error: z.prettifyError(parseParams.error) },
							{ status: 400 },
						)

					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const history = await fetchAddressHistoryData({
						address,
						chainId,
						searchParams: parseParams.data,
						maxLimit: MAX_LIMIT,
					})

					return Response.json(history satisfies HistoryResponse)
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : error
					console.error(errorMessage)
					return Response.json(
						{ data: null, error: errorMessage },
						{ status: 500 },
					)
				}
			},
		},
	},
})
