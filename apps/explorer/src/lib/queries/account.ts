import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Address } from 'ox'
import type { RpcTransaction } from 'viem'
import type * as z from 'zod/mini'

import { getApiUrl } from '#lib/env.ts'
import type { RequestParametersSchema as AccountRequestParametersSchema } from '#routes/api/address/$address.ts'
import type { HistoryResponse } from '#routes/api/address/history/$address.ts'

type AccountRequestParameters = Omit<
	z.infer<typeof AccountRequestParametersSchema>,
	'page' | 'sort' | 'include'
>

type TransactionsApiResponse = {
	transactions: Array<RpcTransaction>
	total: number
	offset: number
	limit: number
	hasMore: boolean
	error: null | string
}

export type { HistoryResponse }

export function transactionsQueryOptions(
	params: {
		page: number
		include?: 'all' | 'sent' | 'received' | undefined
		sort?: 'asc' | 'desc' | undefined
		address: Address.Address
		_key?: string | undefined
	} & AccountRequestParameters,
) {
	const searchParams = new URLSearchParams({
		include: params?.include ?? 'all',
		sort: params?.sort ?? 'desc',
		limit: params.limit.toString(),
		offset: params.offset.toString(),
	})
	return queryOptions({
		queryKey: [
			'account-transactions',
			params.address,
			params.page,
			params.limit,
			params.offset,
			params.sort ?? 'desc',
			params._key,
		],
		queryFn: async ({ signal }): Promise<TransactionsApiResponse> => {
			const url = getApiUrl(`/api/address/${params.address}`, searchParams)
			const response = await fetch(url, { signal })
			const data = await response.json()
			return data as TransactionsApiResponse
		},
		// Prevent immediate refetch on hydration - let SSR data be used
		staleTime: 10_000,
		refetchInterval: false,
		refetchOnWindowFocus: false,
		placeholderData: keepPreviousData,
	})
}

export type TransactionsData = Awaited<
	ReturnType<
		NonNullable<ReturnType<typeof transactionsQueryOptions>['queryFn']>
	>
>

/**
 * Data sources to query for transaction history:
 * - txs: Direct transactions (from/to the address)
 * - transfers: Transfer events where address is sender/recipient
 * - emitted: Transfer events emitted by the address (for token contracts)
 *
 * Default: 'txs,transfers' - skips emitted to avoid expensive queries for tokens
 * For wallet addresses, pass 'txs,transfers,emitted' to include all sources
 */
export type HistorySources = 'txs' | 'transfers' | 'emitted'

export function historyQueryOptions(params: {
	page: number
	limit: number
	offset: number
	include?: 'all' | 'sent' | 'received' | undefined
	address: Address.Address
	sources?: HistorySources[] | undefined
}) {
	const sources = params.sources?.join(',') ?? 'txs,transfers,emitted'
	const searchParams = new URLSearchParams({
		include: params?.include ?? 'all',
		limit: params.limit.toString(),
		offset: params.offset.toString(),
		sources,
	})
	return queryOptions({
		queryKey: [
			'account-history',
			params.address,
			params.page,
			params.limit,
			params.offset,
			sources,
		],
		queryFn: async ({ signal }): Promise<HistoryResponse> => {
			const url = getApiUrl(
				`/api/address/history/${params.address}`,
				searchParams,
			)
			const response = await fetch(url, { signal })
			const data = await response.json()
			return data as HistoryResponse
		},
		staleTime: 10_000,
		refetchInterval: false,
		refetchOnWindowFocus: false,
		placeholderData: keepPreviousData,
	})
}

export type HistoryData = Awaited<
	ReturnType<NonNullable<ReturnType<typeof historyQueryOptions>['queryFn']>>
>
