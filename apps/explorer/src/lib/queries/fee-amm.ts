import { queryOptions } from '@tanstack/react-query'
import { fetchFeeAmmPools } from '#lib/server/fee-amm'
import type { FeeAmmSearch } from '#lib/fee-amm'
import { getTempoChain } from '#wagmi.config'

export function feeAmmPoolsQueryOptions(input: FeeAmmSearch) {
	return queryOptions({
		queryKey: [
			'fee-amm-pools',
			getTempoChain().id,
			{ ...input, token: input.token?.toLowerCase() },
		],
		queryFn: () => fetchFeeAmmPools({ data: input }),
		staleTime: 60_000,
		retry: 1,
	})
}
