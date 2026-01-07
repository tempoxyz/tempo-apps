import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Address } from 'ox'
import type { RpcTransaction } from 'viem'
import type * as z from 'zod/mini'

import type { RequestParametersSchema as AccountRequestParametersSchema } from '#routes/api/address/$address.ts'

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

export function transactionsQueryOptions(
	params: {
		page: number
		include?: 'all' | 'sent' | 'received' | undefined
		address: Address.Address
		_key?: string | undefined
	} & AccountRequestParameters,
) {
	const searchParams = new URLSearchParams({
		include: params?.include ?? 'all',
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
			params._key,
		],
		queryFn: async ({ signal }): Promise<TransactionsApiResponse> => {
			const response = await fetch(
				`${__BASE_URL__}/api/address/${params.address}?${searchParams}`,
				{ signal },
			)
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
