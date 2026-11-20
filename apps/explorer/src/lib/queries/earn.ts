import { queryOptions } from '@tanstack/react-query'
import { fetchEarnVaultActivity, fetchEarnVaults } from '#lib/server/earn'
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

export function earnVaultActivityQueryOptions(
	vault: `0x${string}`,
	asset: `0x${string}`,
	live: boolean,
) {
	return queryOptions({
		queryKey: ['earn-vault-activity', getTempoChain().id, vault, asset],
		queryFn: () => fetchEarnVaultActivity({ data: { vault, asset } }),
		staleTime: 10_000,
		refetchInterval: live ? 10_000 : false,
		retry: 1,
	})
}
