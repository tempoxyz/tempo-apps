import { queryOptions } from '@tanstack/react-query'
import {
	fetchPropAmmPools,
	fetchPropAmmQuotes,
	fetchPropAmmTrades,
} from '#lib/server/propamm'
import { getTempoChain } from '#wagmi.config'

export function propAmmPoolsQueryOptions() {
	return queryOptions({
		queryKey: ['propamm-pools', getTempoChain().id],
		queryFn: () => fetchPropAmmPools(),
		staleTime: 15_000,
		refetchInterval: 15_000,
		retry: 1,
	})
}

export function propAmmTradesQueryOptions() {
	return queryOptions({
		queryKey: ['propamm-trades', getTempoChain().id],
		queryFn: () => fetchPropAmmTrades(),
		staleTime: 30_000,
		refetchInterval: 30_000,
		retry: 1,
	})
}

export function propAmmQuotesQueryOptions(input: {
	from: string
	to: string
	amount: string
}) {
	return queryOptions({
		queryKey: ['propamm-quotes', getTempoChain().id, input],
		queryFn: () => fetchPropAmmQuotes({ data: input }),
		staleTime: 15_000,
		retry: 1,
	})
}
