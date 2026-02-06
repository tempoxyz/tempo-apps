import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { getApiUrl } from '#lib/env'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import type { StatsApiResponse } from '#routes/api/stats'

async function fetchStats(): Promise<StatsApiResponse['data']> {
	const response = await fetch(getApiUrl('/api/stats'))
	if (!response.ok) throw new Error('Failed to fetch stats')
	const json: StatsApiResponse = await response.json()
	if (json.error) throw new Error(json.error)
	return json.data
}

function formatNumber(num: number, max?: number): string {
	if (max && num >= max) return `${(max / 1000).toFixed(0)}K+`
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
	return num.toLocaleString()
}

export function NetworkStats(): React.JSX.Element | null {
	const { data, isLoading, isError } = useQuery({
		queryKey: ['network-stats'],
		queryFn: fetchStats,
		staleTime: 60_000,
		gcTime: 5 * 60_000,
		refetchInterval: 60_000,
		retry: 2,
	})

	if (isLoading || isError || !data) return null

	const hasAnyData =
		data.transactions24h > 0 || data.tokens > 0 || data.accounts24h > 0

	if (!hasAnyData) return null

	const stats = [
		data.transactions24h > 0 && {
			value: formatNumber(data.transactions24h),
			label: 'txns / 24h',
		},
		data.tokens > 0 && {
			value: formatNumber(data.tokens, TOKEN_COUNT_MAX),
			label: 'tokens',
		},
		data.accounts24h > 0 && {
			value: `+${formatNumber(data.accounts24h)}`,
			label: 'accounts / 24h',
		},
	].filter(Boolean) as Array<{ value: string; label: string }>

	return (
		<section className="text-center px-4 pt-4">
			<div className="flex items-center justify-center gap-5 text-[13px]">
				{stats.map((stat, i) => (
					<React.Fragment key={stat.label}>
						{i > 0 && <div className="h-8 w-px bg-base-border opacity-50" />}
						<StatItem value={stat.value} label={stat.label} />
					</React.Fragment>
				))}
			</div>
		</section>
	)
}

function StatItem(props: { value: string; label: string }): React.JSX.Element {
	return (
		<div className="flex flex-col items-center gap-0.5">
			<span className="text-[15px] text-primary font-medium tabular-nums">
				{props.value}
			</span>
			<span className="text-tertiary">{props.label}</span>
		</div>
	)
}
