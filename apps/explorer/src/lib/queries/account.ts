import { queryOptions } from '@tanstack/react-query'
import type { Address } from 'ox'
import type { RpcTransaction } from 'viem'
import type * as z from 'zod/mini'

import { isTip20Address } from '#lib/domain/tip20'
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
	})
}

export type TransactionsData = Awaited<
	ReturnType<
		NonNullable<ReturnType<typeof transactionsQueryOptions>['queryFn']>
	>
>

export type HistorySources = 'txs' | 'transfers' | 'emitted'

const STANDARD_HISTORY_SOURCES: HistorySources[] = ['txs', 'transfers']
const TIP20_HISTORY_SOURCES: HistorySources[] = ['txs']

export function historySourcesForAddress(
	address: Address.Address,
): ReadonlyArray<HistorySources> {
	return isTip20Address(address)
		? TIP20_HISTORY_SOURCES
		: STANDARD_HISTORY_SOURCES
}

export function historyQueryOptions(params: {
	page: number
	limit: number
	offset: number
	include?: 'all' | 'sent' | 'received' | undefined
	after?: number | undefined
	address: Address.Address
	sources: ReadonlyArray<HistorySources>
	status?: 'success' | 'reverted' | undefined
}) {
	const sources = params.sources.join(',')
	const searchParams = new URLSearchParams({
		include: params?.include ?? 'all',
		limit: params.limit.toString(),
		offset: params.offset.toString(),
		sources,
	})
	if (params.status) {
		searchParams.set('status', params.status)
	}
	if (params.include && params.include !== 'all') {
		searchParams.set('include', params.include)
	}
	if (params.after) {
		searchParams.set('after', params.after.toString())
	}
	return queryOptions({
		queryKey: [
			'account-history',
			params.address,
			params.page,
			params.limit,
			params.offset,
			sources,
			params.include ?? 'all',
			params.after,
			params.status ?? 'all',
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
	})
}

export type HistoryData = Awaited<
	ReturnType<NonNullable<ReturnType<typeof historyQueryOptions>['queryFn']>>
>
