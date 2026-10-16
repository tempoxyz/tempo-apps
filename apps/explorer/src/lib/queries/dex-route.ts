import { queryOptions } from '@tanstack/react-query'
import type { DexRouteInput } from '#lib/dex-route'
import { fetchDexRoute } from '#lib/server/dex-route'
import { getTempoChain } from '#wagmi.config'

export function dexRouteQueryOptions(input: DexRouteInput) {
	return queryOptions({
		queryKey: ['dex-route', getTempoChain().id, input],
		queryFn: () => fetchDexRoute({ data: input }),
		staleTime: 15_000,
		retry: 1,
	})
}
