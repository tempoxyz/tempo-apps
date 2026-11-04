import { queryOptions } from '@tanstack/react-query'
import { fetchPropAmmPools } from '#lib/server/propamm'
import { getTempoChain } from '#wagmi.config'

export function propAmmPoolsQueryOptions() {
	return queryOptions({
		queryKey: ['propamm-pools', getTempoChain().id],
		queryFn: () => fetchPropAmmPools(),
		staleTime: 30_000,
		refetchInterval: 30_000,
		retry: 1,
	})
}
