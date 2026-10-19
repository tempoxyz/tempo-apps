import { queryOptions } from '@tanstack/react-query'
import type { DexRouteInput } from '#lib/dex-route'
import {
	type DexDepthInput,
	fetchDexLegDepth,
	fetchDexRoute,
} from '#lib/server/dex-route'
import { getTempoChain } from '#wagmi.config'

export function dexRouteQueryOptions(input: DexRouteInput) {
	return queryOptions({
		queryKey: ['dex-route', getTempoChain().id, input],
		queryFn: () => fetchDexRoute({ data: input }),
		staleTime: 15_000,
		retry: 1,
	})
}

export function dexLegDepthQueryOptions(input: DexDepthInput) {
	return queryOptions({
		queryKey: ['dex-leg-depth', getTempoChain().id, input],
		queryFn: () => fetchDexLegDepth({ data: input }),
		staleTime: Number.POSITIVE_INFINITY,
		retry: 1,
	})
}
