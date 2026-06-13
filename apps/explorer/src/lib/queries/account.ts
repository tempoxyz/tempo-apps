import { queryOptions } from '@tanstack/react-query'
import type { Address } from 'ox'
import * as z from 'zod/mini'

import { getApiUrl } from '#lib/env.ts'
import type { HistoryResponse } from '#routes/api/address/history/$address.ts'
export type { HistoryResponse }

const HistoryResponseSchema = z.object({
	transactions: z.array(z.any()),
	total: z.number(),
	page: z.number(),
	limit: z.number(),
	hasMore: z.boolean(),
	countCapped: z.boolean(),
	error: z.union([z.string(), z.null()]),
})

const HistoryErrorResponseSchema = z.object({
	error: z.string(),
})

export function historyQueryOptions(params: {
	page: number
	limit: number
	include?: 'all' | 'sent' | 'received' | undefined
	after?: number | undefined
	address: Address.Address
	status?: 'success' | 'reverted' | undefined
}) {
	const searchParams = new URLSearchParams({
		include: params?.include ?? 'all',
		limit: params.limit.toString(),
		page: params.page.toString(),
	})
	if (params.status) {
		searchParams.set('status', params.status)
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
			const json = await response.json()

			const parsed = z.safeParse(HistoryResponseSchema, json)
			if (parsed.success) return parsed.data

			const parsedError = z.safeParse(HistoryErrorResponseSchema, json)
			if (parsedError.success) throw new Error(parsedError.data.error)

			return {
				transactions: [],
				total: 0,
				page: params.page,
				limit: params.limit,
				hasMore: false,
				countCapped: false,
				error: `Failed to load transaction history: ${z.prettifyError(parsed.error)}`,
			}
		},
		staleTime: 10_000,
		refetchInterval: false,
		refetchOnWindowFocus: false,
	})
}

export type HistoryData = Awaited<
	ReturnType<NonNullable<ReturnType<typeof historyQueryOptions>['queryFn']>>
>
