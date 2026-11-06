import { queryOptions } from '@tanstack/react-query'
import { fetchUniswapPools, fetchUniswapTrades } from '#lib/server/uniswap'
import { getTempoChain } from '#wagmi.config'

export function uniswapPoolsQueryOptions() {
	return queryOptions({
		queryKey: ['uniswap-pools', getTempoChain().id],
		queryFn: () => fetchUniswapPools(),
		staleTime: 15_000,
		refetchInterval: 15_000,
		retry: 1,
	})
}

export function uniswapTradesQueryOptions() {
	return queryOptions({
		queryKey: ['uniswap-trades', getTempoChain().id],
		queryFn: () => fetchUniswapTrades(),
		staleTime: 30_000,
		refetchInterval: 30_000,
		retry: 1,
	})
}
