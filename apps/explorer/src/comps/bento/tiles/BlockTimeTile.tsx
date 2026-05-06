import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { BarChart } from '#comps/bento/charts/BarChart'
import { percentile } from '#comps/bento/charts/chart-utils'
import { LivePulseDot } from '#comps/bento/LivePulseDot'
import { landingRecentBlocksQueryOptions } from '#lib/queries'
import TimerIcon from '~icons/lucide/timer'

const BINS = 30

export function BlockTimeTile(): React.JSX.Element {
	const { data, isPending, isError, refetch } = useQuery(
		landingRecentBlocksQueryOptions(),
	)

	const { bins, p50, p95, avg } = React.useMemo(() => {
		if (!data || data.blocks.length < 2)
			return { bins: [], p50: 0, p95: 0, avg: 0 }

		// Per-block time differences (integer seconds from testnet).
		const diffs: number[] = []
		for (let i = 1; i < data.blocks.length; i++) {
			const dt = data.blocks[i].timestamp - data.blocks[i - 1].timestamp
			if (dt >= 0) diffs.push(dt)
		}

		// Bucket diffs into BINS bins and average each — smooths out the
		// 0/1 quantization from second-resolution timestamps into readable
		// floating-point values.
		const bucket = new Array<number>(BINS).fill(0)
		const counts = new Array<number>(BINS).fill(0)
		for (let i = 0; i < diffs.length; i++) {
			const bIdx = Math.min(BINS - 1, Math.floor((i / diffs.length) * BINS))
			bucket[bIdx] += diffs[i]
			counts[bIdx] += 1
		}
		const binAverages = bucket.map((sum, i) =>
			counts[i] > 0 ? sum / counts[i] : 0,
		)

		const sorted = [...diffs].sort((a, b) => a - b)
		const sum = diffs.reduce((a, b) => a + b, 0)
		return {
			bins: binAverages,
			p50: percentile(sorted, 50),
			p95: percentile(sorted, 95),
			avg: diffs.length ? sum / diffs.length : 0,
		}
	}, [data])

	const isEmpty = !isPending && !isError && bins.length === 0

	return (
		<BentoTile
			title={
				<>
					<LivePulseDot />
					Block time
				</>
			}
			titleAside={
				bins.length ? `p50 ${p50.toFixed(1)}s · p95 ${p95.toFixed(1)}s` : null
			}
			span={{ base: 2, sm: 2, lg: 2 }}
			rowSpan={{ base: 1, lg: 1 }}
			status={
				isPending ? 'loading' : isError ? 'error' : isEmpty ? 'empty' : 'ready'
			}
			empty={{ icon: <TimerIcon />, label: 'Waiting for blocks' }}
			onRetry={() => refetch()}
			contentClassName="justify-end gap-1.5"
		>
			<div className="h-7 flex items-end">
				<BentoTile.PrimaryValue
					value={avg ? avg.toFixed(2) : '—'}
					suffix={avg ? 's' : undefined}
				/>
			</div>
			<div className="h-12">
				{bins.length ? (
					<BarChart
						values={bins}
						height={56}
						width={260}
						gradient
						ariaLabel="block time trend"
						renderTooltip={(i) => `${bins[i].toFixed(2)}s avg`}
					/>
				) : null}
			</div>
		</BentoTile>
	)
}
