import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { StatusBar, type StatusSegment } from '#comps/bento/charts/StatusBar'
import {
	landingChainVitalsQueryOptions,
	landingRecentBlocksQueryOptions,
} from '#lib/queries'
import ActivityIcon from '~icons/lucide/activity'

const SEGMENTS = 80

export function UptimeTile(): React.JSX.Element {
	const recent = useQuery(landingRecentBlocksQueryOptions())
	const vitals = useQuery(landingChainVitalsQueryOptions())

	const { segments, percent } = React.useMemo(() => {
		const blocks = recent.data?.blocks ?? []
		if (blocks.length < 2)
			return { segments: [] as StatusSegment[], percent: null as number | null }

		const first = blocks[0].timestamp
		const last = blocks[blocks.length - 1].timestamp
		const windowSecs = Math.max(1, last - first)
		const sliceSecs = windowSecs / SEGMENTS

		const diffs: number[] = []
		for (let i = 1; i < blocks.length; i++) {
			const dt = blocks[i].timestamp - blocks[i - 1].timestamp
			if (dt > 0) diffs.push(dt)
		}
		const median =
			diffs.length === 0
				? 1
				: [...diffs].sort((a, b) => a - b)[Math.floor(diffs.length / 2)]
		const expectedPerSlice = Math.max(1, Math.round(sliceSecs / median))

		const counts = new Array<number>(SEGMENTS).fill(0)
		for (const b of blocks) {
			const idx = Math.min(
				SEGMENTS - 1,
				Math.max(0, Math.floor((b.timestamp - first) / sliceSecs)),
			)
			counts[idx] += 1
		}

		const result: StatusSegment[] = counts.map((c, i) => {
			const sliceStart = new Date((first + i * sliceSecs) * 1000)
			const status: StatusSegment['status'] =
				c === 0 ? 'stalled' : c < expectedPerSlice / 2 ? 'slow' : 'healthy'
			return {
				status,
				label: `${sliceStart.toLocaleTimeString()} · ${c} blocks`,
			}
		})

		const healthyCount = result.filter((s) => s.status === 'healthy').length
		const pct = (healthyCount / result.length) * 100
		return { segments: result, percent: pct }
	}, [recent.data])

	const genesis = vitals.data?.genesisTimestamp ?? null
	const daysLive = React.useMemo(() => {
		if (!genesis) return null
		return Math.max(0, Math.floor((Date.now() / 1000 - genesis) / 86400))
	}, [genesis])

	const isLoading = recent.isPending || vitals.isPending
	const isEmpty = !isLoading && segments.length === 0

	return (
		<BentoTile
			title="Uptime"
			titleAside={
				daysLive != null ? `${daysLive.toLocaleString()} days live` : null
			}
			span={{ base: 2, sm: 2, lg: 2 }}
			rowSpan={{ base: 1, lg: 1 }}
			status={isLoading ? 'loading' : isEmpty ? 'empty' : 'ready'}
			empty={{ icon: <ActivityIcon />, label: 'Waiting for blocks' }}
			contentClassName="justify-end gap-1.5"
		>
			<div className="h-7 flex items-end">
				<BentoTile.PrimaryValue
					value={percent != null ? `${percent.toFixed(2)}%` : '—'}
				/>
			</div>
			<div className="h-12">
				{segments.length ? (
					<StatusBar
						segments={segments}
						ariaLabel="recent block production uptime"
					/>
				) : null}
			</div>
		</BentoTile>
	)
}
