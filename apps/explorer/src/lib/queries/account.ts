import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Address } from 'ox'
import * as AccountServer from '#lib/server/account.server.ts'

export type TransactionQueryParams = {
	address: Address.Address
	page: number
	limit: number
	offset: number
	_key?: string | undefined
}

export function transactionsQueryOptions(params: TransactionQueryParams) {
	return queryOptions({
		queryKey: [
			'account-transactions',
			params.address,
			params.page,
			params.limit,
			params._key,
		],
		queryFn: () =>
			AccountServer.fetchTransactions({
				data: {
					address: params.address,
					offset: params.offset,
					limit: params.limit,
				},
			}),
		refetchInterval: false,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		placeholderData: keepPreviousData,
	})
}

export type TransactionsData = Awaited<
	ReturnType<
		NonNullable<ReturnType<typeof transactionsQueryOptions>['queryFn']>
	>
>
