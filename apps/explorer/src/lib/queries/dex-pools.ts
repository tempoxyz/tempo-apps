import type { Address, Hex } from 'viem'
import { queryOptions } from '@tanstack/react-query'
import { fetchDexPools } from '#lib/server/dex-pools'
import { fetchDexSwaps, fetchDexTransactionFills } from '#lib/server/dex-swaps'
import { getTempoChain } from '#wagmi.config'

export function dexPoolsQueryOptions() {
	return queryOptions({
		queryKey: ['dex-pools', getTempoChain().id],
		queryFn: () => fetchDexPools(),
		staleTime: 30_000,
		retry: 1,
	})
}

export function dexSwapsQueryOptions(
	live: boolean,
	input: {
		path?: Address[] | undefined
		bases?: Address[] | undefined
		unverified?: boolean | undefined
	},
) {
	return queryOptions({
		queryKey: [
			'dex-swaps',
			getTempoChain().id,
			input.path ?? null,
			input.bases ?? null,
			Boolean(input.unverified),
		],
		queryFn: () => fetchDexSwaps({ data: input }),
		staleTime: 4_000,
		refetchInterval: live ? 5_000 : false,
		retry: 1,
	})
}

export function dexTransactionFillsQueryOptions(hash: Hex) {
	return queryOptions({
		queryKey: ['dex-transaction-fills', getTempoChain().id, hash],
		queryFn: () => fetchDexTransactionFills({ data: { hash } }),
		staleTime: Number.POSITIVE_INFINITY,
		// The indexer can trail a transaction by a few blocks, and a token
		// read can fail; retry an incomplete result a few times.
		refetchInterval: (query) =>
			query.state.data?.complete || query.state.dataUpdateCount >= 5
				? false
				: 3_000,
	})
}
