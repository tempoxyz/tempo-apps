import { queryOptions } from '@tanstack/react-query'
import { fetchVaultActivity, fetchVaults } from '#lib/server/vaults'
import type { VaultKind } from '#lib/vaults'
import { getTempoChain } from '#wagmi.config'

export function vaultsQueryOptions() {
	return queryOptions({
		queryKey: ['vaults', getTempoChain().id],
		queryFn: () => fetchVaults(),
		staleTime: 60_000,
		refetchInterval: 60_000,
		retry: 1,
	})
}

export function vaultActivityQueryOptions(
	kind: VaultKind,
	vault: `0x${string}`,
	asset: `0x${string}`,
	live: boolean,
) {
	return queryOptions({
		queryKey: ['vault-activity', getTempoChain().id, kind, vault, asset],
		queryFn: () => fetchVaultActivity({ data: { kind, vault, asset } }),
		staleTime: 10_000,
		refetchInterval: live ? 10_000 : false,
		retry: 1,
	})
}
