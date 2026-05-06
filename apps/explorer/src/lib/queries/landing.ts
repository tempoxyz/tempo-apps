import { queryOptions } from '@tanstack/react-query'
import {
	fetchLandingChainVitals,
	fetchLandingHeatmap,
	fetchLandingHeatmapGas,
	fetchLandingNotableTxs,
	fetchLandingPopularCalls,
	fetchLandingRecentBlocks,
	fetchLandingTokenLaunches,
	fetchLandingTopTokens,
	fetchLandingTvlSeries,
	fetchLandingTxRate,
	type HeatmapWindow,
	type TxRateWindow,
} from '#lib/server/landing-stats'

/** Default: fail fast (one retry) so tiles don't sit in loading for 15s. */
const LANDING_RETRY = 1

export function landingRecentBlocksQueryOptions() {
	return queryOptions({
		queryKey: ['landing', 'recent-blocks'],
		queryFn: () => fetchLandingRecentBlocks(),
		staleTime: 5_000,
		refetchInterval: 5_000,
		retry: LANDING_RETRY,
	})
}

export function landingHeatmapQueryOptions(window: HeatmapWindow = '7d') {
	return queryOptions({
		queryKey: ['landing', 'heatmap', 'txs', window],
		queryFn: () => fetchLandingHeatmap({ data: { window } }),
		staleTime: 60_000,
		refetchInterval: 60_000,
		retry: LANDING_RETRY,
	})
}

export function landingHeatmapGasQueryOptions(window: HeatmapWindow = '7d') {
	return queryOptions({
		queryKey: ['landing', 'heatmap', 'gas', window],
		queryFn: () => fetchLandingHeatmapGas({ data: { window } }),
		staleTime: 60_000,
		refetchInterval: 60_000,
		retry: LANDING_RETRY,
	})
}

export function landingChainVitalsQueryOptions() {
	return queryOptions({
		queryKey: ['landing', 'chain-vitals'],
		queryFn: () => fetchLandingChainVitals(),
		staleTime: 30_000,
		refetchInterval: 30_000,
		retry: LANDING_RETRY,
	})
}

export function landingTokenLaunchesQueryOptions() {
	return queryOptions({
		queryKey: ['landing', 'token-launches'],
		queryFn: () => fetchLandingTokenLaunches(),
		staleTime: 60_000,
		retry: LANDING_RETRY,
	})
}

export function landingTopTokensQueryOptions() {
	return queryOptions({
		queryKey: ['landing', 'top-tokens'],
		queryFn: () => fetchLandingTopTokens(),
		staleTime: 5 * 60_000,
		retry: LANDING_RETRY,
	})
}

export function landingNotableTxsQueryOptions(window: TxRateWindow = '24h') {
	return queryOptions({
		queryKey: ['landing', 'notable-txs', window],
		queryFn: () => fetchLandingNotableTxs({ data: { window } }),
		staleTime: 30_000,
		refetchInterval: 30_000,
		retry: LANDING_RETRY,
	})
}

export function landingPopularCallsQueryOptions(window: TxRateWindow = '24h') {
	return queryOptions({
		queryKey: ['landing', 'popular-calls', window],
		queryFn: () => fetchLandingPopularCalls({ data: { window } }),
		staleTime: 60_000,
		refetchInterval: 60_000,
		retry: LANDING_RETRY,
	})
}

export function landingTvlSeriesQueryOptions() {
	return queryOptions({
		queryKey: ['landing', 'tvl-series'],
		queryFn: () => fetchLandingTvlSeries(),
		staleTime: 5 * 60_000,
		retry: LANDING_RETRY,
	})
}

export function landingTxRateQueryOptions(window: TxRateWindow) {
	return queryOptions({
		queryKey: ['landing', 'tx-rate', window],
		queryFn: () => fetchLandingTxRate({ data: { window } }),
		staleTime: window === '1h' ? 30_000 : 60_000,
		refetchInterval: window === '1h' ? 30_000 : 60_000,
		retry: LANDING_RETRY,
	})
}
