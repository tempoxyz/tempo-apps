import { queryOptions } from '@tanstack/react-query'
import { fetchFeeAmmPools } from '#lib/server/fee-amm'

export function feeAmmPoolsQueryOptions() {
	return queryOptions({
		queryKey: ['fee-amm-pools'],
		queryFn: () => fetchFeeAmmPools(),
		staleTime: 60_000,
	})
}
