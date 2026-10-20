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
		// A complete result's fills never change, though whether their books
		// are still active can. Until then the indexer can trail the
		// transaction or a read can fail, so keep retrying with backoff.
		staleTime: (query) => (query.state.data?.complete ? 60_000 : 0),
		refetchInterval: (query) =>
			query.state.data?.complete
				? false
				: Math.min(3_000 * 2 ** query.state.dataUpdateCount, 60_000),
	})
}
