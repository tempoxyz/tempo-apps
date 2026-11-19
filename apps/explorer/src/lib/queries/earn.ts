import { queryOptions } from '@tanstack/react-query'
import { fetchEarnVaults } from '#lib/server/earn'
import { getTempoChain } from '#wagmi.config'

export function earnVaultsQueryOptions() {
	return queryOptions({
		queryKey: ['earn-vaults', getTempoChain().id],
		queryFn: () => fetchEarnVaults(),
		staleTime: 60_000,
		refetchInterval: 60_000,
		retry: 1,
	})
}
