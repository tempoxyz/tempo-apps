import { queryOptions } from '@tanstack/react-query'
import type { Address } from 'ox'
import {
	fetchAccountTransfers,
	fetchHolders,
	fetchTransfers,
} from '#lib/server/token.ts'
import { fetchTokens } from '#lib/server/tokens.ts'

export const TOKENS_PER_PAGE = 12

export type TransfersQueryParams = {
	address: Address.Address
	page: number
	limit: number
	account?: Address.Address | undefined
	_key?: string | undefined
}

export type HoldersQueryParams = {
	address: Address.Address
	page: number
	limit: number
}

export function transfersQueryOptions(params: TransfersQueryParams) {
	return queryOptions({
		queryKey: [
			'token-transfers',
			params.address,
			params.page,
			params.limit,
			params.account,
			params._key,
		],
		queryFn: async () => {
			const data = await fetchTransfers({
				data: {
					address: params.address,
					page: params.page,
					limit: params.limit,
					account: params.account,
				},
			})
			return data
		},
	})
}

export function accountTransfersQueryOptions(params: {
	account: Address.Address
	page: number
	limit: number
}) {
	return queryOptions({
		queryKey: ['account-transfers', params.account, params.page, params.limit],
		queryFn: async () => {
			const data = await fetchAccountTransfers({
				data: {
					account: params.account,
					page: params.page,
					limit: params.limit,
				},
			})
			return data
		},
	})
}

export function holdersQueryOptions(params: HoldersQueryParams) {
	return queryOptions({
		queryKey: ['token-holders', params.address, params.page, params.limit],
		queryFn: async () => {
			const data = await fetchHolders({
				data: {
					address: params.address,
					page: params.page,
					limit: params.limit,
				},
			})
			return data
		},
	})
}

export function tokensListQueryOptions(params: {
	page: number
	limit: number
}) {
	return queryOptions({
		queryKey: ['tokens', params.page, params.limit],
		queryFn: () =>
			fetchTokens({
				data: {
					page: params.page,
					limit: params.limit,
				},
			}),
	})
}
