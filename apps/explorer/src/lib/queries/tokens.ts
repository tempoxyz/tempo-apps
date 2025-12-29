import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Address } from 'ox'
import {
	fetchFirstTransfer,
	fetchHolders,
	fetchTransfers,
} from '#lib/server/token.server.ts'
import { fetchTokens } from '#lib/server/tokens.server.ts'

export const TOKENS_PER_PAGE = 12

export type TransfersQueryParams = {
	address: Address.Address
	page: number
	limit: number
	offset: number
	account?: Address.Address | undefined
	_key?: string | undefined
}

export type HoldersQueryParams = {
	address: Address.Address
	page: number
	limit: number
	offset: number
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
					offset: params.offset,
					limit: params.limit,
					account: params.account,
				},
			})
			return data
		},
		placeholderData: keepPreviousData,
	})
}

export function holdersQueryOptions(params: HoldersQueryParams) {
	return queryOptions({
		queryKey: ['token-holders', params.address, params.page, params.limit],
		queryFn: async () => {
			const data = await fetchHolders({
				data: {
					address: params.address,
					offset: params.offset,
					limit: params.limit,
				},
			})
			return data
		},
		placeholderData: keepPreviousData,
	})
}

export function firstTransferQueryOptions(params: { address: Address.Address }) {
	return queryOptions({
		queryKey: ['token-first-transfer', params.address],
		queryFn: async () => {
			const data = await fetchFirstTransfer({
				data: { address: params.address },
			})
			return data
		},
		staleTime: 60_000,
	})
}

export function tokensListQueryOptions(params: {
	page: number
	limit: number
}) {
	const offset = (params.page - 1) * params.limit
	return queryOptions({
		queryKey: ['tokens', params.page, params.limit],
		queryFn: () => fetchTokens({ data: { offset, limit: params.limit } }),
		placeholderData: keepPreviousData,
	})
}
