import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { landingTvlSeriesQueryOptions } from '#lib/queries'
import BarChartIcon from '~icons/lucide/bar-chart-3'

const PALETTE = [
	'var(--color-accent)',
	'color-mix(in srgb, var(--color-accent) 70%, var(--color-positive) 30%)',
	'color-mix(in srgb, var(--color-accent) 40%, var(--color-positive) 60%)',
	'color-mix(in srgb, var(--color-positive) 70%, var(--color-accent) 30%)',
	'var(--color-positive)',
	'var(--color-content-dimmed)',
]

const compactUsd = new Intl.NumberFormat(undefined, {
	notation: 'compact',
	maximumFractionDigits: 2,
	style: 'currency',
	currency: 'USD',
})

export function TvlOverTimeTile(): React.JSX.Element {
	const { data, isPending, isError, refetch } = useQuery(
		landingTvlSeriesQueryOptions(),
	)

	const { rows, total } = React.useMemo(() => {
		if (!data)
			return {
				rows: [] as Array<{
					key: string
					label: string
					value: number
					color: string
				}>,
				total: 0,
			}

		const entries: Array<{
			key: string
			label: string
			value: number
			color: string
		}> = data.tokens.map((t, i) => ({
			key: t.address,
			label: t.symbol || t.name,
			value: t.usdValue,
			color: PALETTE[i] ?? PALETTE[PALETTE.length - 2],
		}))
		if (data.other.usdValue > 0) {
			entries.push({
				key: 'other',
				label: `Other · ${data.other.count}`,
				value: data.other.usdValue,
				color: PALETTE[PALETTE.length - 1],
			})
		}
		return { rows: entries, total: data.totalUsd }
	}, [data])

	const isEmpty = !isPending && !isError && rows.length === 0

	return (
		<BentoTile
			title="Total value locked"
			span={{ base: 2, sm: 4, lg: 6 }}
			rowSpan={{ base: 1, lg: 1 }}
			status={
				isPending ? 'loading' : isError ? 'error' : isEmpty ? 'empty' : 'ready'
			}
			empty={{ icon: <BarChartIcon />, label: 'No token supplies available' }}
			onRetry={() => refetch()}
			contentClassName="gap-2 justify-end"
		>
			<div className="flex items-center justify-between gap-3 min-w-0">
				<BentoTile.PrimaryValue
					value={total ? compactUsd.format(total) : '—'}
				/>
				<ul className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] justify-end min-w-0">
					{rows.map((row) => {
						const pct = total > 0 ? (row.value / total) * 100 : 0
						return (
							<li key={row.key} className="flex items-center gap-1.5 min-w-0">
								<span
									className="size-[8px] rounded-[2px] shrink-0"
									style={{ backgroundColor: row.color }}
								/>
								<span className="text-primary truncate">{row.label}</span>
								<span className="font-mono tabular-nums text-[10.5px] text-tertiary">
									{pct.toFixed(1)}%
								</span>
							</li>
						)
					})}
				</ul>
			</div>
			<StackBar rows={rows} total={total} />
		</BentoTile>
	)
}

function StackBar(props: {
	rows: Array<{ key: string; label: string; value: number; color: string }>
	total: number
}): React.JSX.Element {
	const { rows, total } = props

	const [hoverKey, setHoverKey] = React.useState<string | null>(null)

	return (
		<div className="flex items-center">
			<div className="relative flex-1 flex h-5 rounded-[6px] overflow-hidden border border-card-border">
				{rows.map((row) => {
					const pct = total > 0 ? (row.value / total) * 100 : 0
					return (
						<div
							key={row.key}
							className="h-full transition-[filter] duration-150"
							style={{
								width: `${Math.max(0.5, pct)}%`,
								backgroundColor: row.color,
								filter:
									hoverKey == null || hoverKey === row.key
										? undefined
										: 'saturate(0.5) brightness(0.85)',
							}}
							title={`${row.label} · ${compactUsd.format(row.value)} (${pct.toFixed(1)}%)`}
							onPointerEnter={() => setHoverKey(row.key)}
							onPointerLeave={() => setHoverKey(null)}
						/>
					)
				})}
			</div>
		</div>
	)
}
