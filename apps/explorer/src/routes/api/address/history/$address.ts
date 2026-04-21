import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { getRequestURL, hasIndexSupply } from '#lib/env'
import {
	enforceCsvExportRateLimit,
	RateLimitExceededError,
} from '#lib/server/export-rate-limit'
import {
	MAX_LIMIT,
	RequestParametersSchema,
	createTransactionsCsvResponse,
	fetchAddressHistoryData,
	fetchAddressHistoryExportRows,
	type HistoryResponse,
} from '#lib/server/address-history'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

export {
	buildTxOnlyTransactions,
	type EnrichedTransaction,
	type HistoryHashEntry,
} from '#lib/server/build-tx-only-transactions'
export type {
	HistoryRequestParameters,
	HistoryResponse,
} from '#lib/server/address-history'

export const Route = createFileRoute('/api/address/history/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!hasIndexSupply())
					return Response.json({
						limit: 0,
						total: 0,
						offset: 0,
						hasMore: false,
						countCapped: false,
						transactions: [],
						error: null,
					} satisfies HistoryResponse)

				try {
					const url = getRequestURL()
					const address = zAddress().parse(params.address)
					Address.assert(address)
					const isCsvExport = url.searchParams.get('format') === 'csv'

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
					if (isCsvExport) {
						await enforceCsvExportRateLimit(address)
						const transactions = await fetchAddressHistoryExportRows({
							address,
							chainId,
							searchParams: parseParams.data,
						})
						return createTransactionsCsvResponse({
							address,
							transactions,
						})
					}
					const history = await fetchAddressHistoryData({
						address,
						chainId,
						searchParams: parseParams.data,
						maxLimit: MAX_LIMIT,
					})

					return Response.json(history satisfies HistoryResponse)
				} catch (error) {
					if (error instanceof RateLimitExceededError) {
						return Response.json(
							{ error: error.message },
							{
								headers: {
									'Retry-After': String(error.retryAfterSeconds),
								},
								status: 429,
							},
						)
					}

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
