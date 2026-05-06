import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { Heatmap } from '#comps/bento/charts/Heatmap'
import { ToggleGroup } from '#comps/bento/ToggleGroup'
import {
	landingHeatmapGasQueryOptions,
	landingHeatmapQueryOptions,
} from '#lib/queries'
import type { HeatmapWindow } from '#lib/server/landing-stats'
import GridIcon from '~icons/lucide/grid-2x2'

const HOURS = 24

const WINDOW_OPTIONS: ReadonlyArray<{
	value: HeatmapWindow
	label: string
	days: number
}> = [
	{ value: '7d', label: '7d', days: 7 },
	{ value: '30d', label: '30d', days: 30 },
	{ value: '90d', label: '90d', days: 90 },
]

/**
 * Lay out the heatmap as a wide grid: more columns than rows, GitHub-graph
 * style. Hourly buckets are flattened then reshaped so the visible matrix
 * is `cols` wide × `rows` tall, with `cols >= rows` and `cols * rows`
 * approximating the bucket count.
 */
function gridShape(totalBuckets: number): { cols: number; rows: number } {
	// Wide GitHub-graph layout: cols ≈ 5 × rows so the heatmap fills the
	// wide tile horizontally with plenty of cells.
	const targetRatio = 5
	const rows = Math.max(
		4,
		Math.round(Math.sqrt(totalBuckets / targetRatio)),
	)
	const cols = Math.ceil(totalBuckets / rows)
	return { cols, rows }
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
	month: 'short',
	day: 'numeric',
})

function hourLabel(h: number) {
	if (h === 0) return '12a'
	if (h === 12) return '12p'
	return h < 12 ? `${h}a` : `${h - 12}p`
}

const compact = new Intl.NumberFormat(undefined, {
	notation: 'compact',
	maximumFractionDigits: 1,
})

type Mode = 'txs' | 'gas'

export function ActivityHeatmapTile(): React.JSX.Element {
	const [mode, setMode] = React.useState<Mode>('txs')
	const [window, setWindow] = React.useState<HeatmapWindow>('7d')

	const txsQuery = useQuery(landingHeatmapQueryOptions(window))
	const gasQuery = useQuery(landingHeatmapGasQueryOptions(window))
	const query = mode === 'txs' ? txsQuery : gasQuery

	const days = WINDOW_OPTIONS.find((o) => o.value === window)?.days ?? 7

	const { flat, total, startHourSec, cols, rows } = React.useMemo(() => {
		const totalBuckets = days * HOURS
		const shape = gridShape(totalBuckets)
		const empty = {
			flat: [] as number[],
			total: 0,
			startHourSec: 0,
			cols: shape.cols,
			rows: shape.rows,
		}
		if (!query.data) return empty

		const now = Math.floor(Date.now() / 1000)
		const nowHourSec = Math.floor(now / 3600) * 3600
		const startHourSec = nowHourSec - (totalBuckets - 1) * 3600

		const bySecond = new Map<number, number>()
		for (const b of query.data.buckets) bySecond.set(b.hour, b.count)

		const flat: number[] = new Array<number>(totalBuckets).fill(0)
		for (let h = 0; h < totalBuckets; h++) {
			const epochSec = startHourSec + h * 3600
			flat[h] = bySecond.get(epochSec) ?? 0
		}

		let totalCount = 0
		for (const v of flat) totalCount += v
		return {
			flat,
			total: totalCount,
			startHourSec,
			cols: shape.cols,
			rows: shape.rows,
		}
	}, [query.data, days])

	const isLoading = query.isPending
	const isError = query.isError
	const isEmpty = !isLoading && !isError && total === 0

	const totalLabel =
		mode === 'txs' ? total.toLocaleString() : compact.format(total)

	return (
		<BentoTile
			title={
				<>
					Transactions <span className="opacity-50 ml-0.5">({window})</span>
				</>
			}
			span={{ base: 2, sm: 4, lg: 4 }}
			rowSpan={{ base: 2, lg: 2 }}
			status={
				isLoading ? 'loading' : isError ? 'error' : isEmpty ? 'empty' : 'ready'
			}
			empty={{ icon: <GridIcon />, label: 'No activity in selected window' }}
			onRetry={() => query.refetch()}
			action={
				<div className="flex items-center gap-1.5">
					<ToggleGroup<Mode>
						options={[
							{ value: 'txs', label: 'Transactions' },
							{ value: 'gas', label: 'Gas' },
						]}
						value={mode}
						onChange={setMode}
					/>
					<BentoTile.SelectAction<HeatmapWindow>
						value={window}
						options={WINDOW_OPTIONS.map(({ value, label }) => ({
							value,
							label,
						}))}
						onChange={setWindow}
						ariaLabel="heatmap window"
					/>
				</div>
			}
			contentClassName="gap-2"
		>
			<BentoTile.PrimaryValue value={totalLabel} />
			<div className="flex flex-1 min-h-0 w-full">
				<Heatmap
					columns={cols}
					rows={rows}
					getValue={(col, row) => {
						// Column-major: each column is a vertical strip of hours
						// running from oldest (top) to newest (bottom).
						const idx = col * rows + row
						return flat[idx] ?? 0
					}}
					getLabel={(col, row, v) => {
						const idx = col * rows + row
						if (idx >= flat.length) return ''
						const epoch = startHourSec + idx * 3600
						const date = new Date(epoch * 1000)
						const dateLabel = DATE_FMT.format(date)
						const hour = hourLabel(date.getHours())
						const label =
							mode === 'txs'
								? `${v.toLocaleString()} txs`
								: `${compact.format(v)} gas`
						return `${dateLabel} · ${hour} — ${label}`
					}}
					ariaLabel={`activity heatmap (${mode}) over ${window}`}
				/>
			</div>
		</BentoTile>
	)
}
