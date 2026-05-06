import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { BlockCard } from '#comps/BlockCard'
import { useLiveBlockNumber } from '#lib/block-number'
import { landingRecentBlocksQueryOptions } from '#lib/queries'
import ActivityIcon from '~icons/lucide/activity'

export function LatestBlockTile(): React.JSX.Element {
	// Use the live (polled) value directly so each successful poll triggers a
	// re-render and the lotto digits roll on whichever digits actually changed.
	// No 500ms throttle / step-by-step animation that obscured "real-time" feel.
	const live = useLiveBlockNumber()

	const { data } = useQuery(landingRecentBlocksQueryOptions())

	const avgBlockTime = React.useMemo(() => {
		if (!data || data.blocks.length < 2) return 0
		const diffs: number[] = []
		for (let i = 1; i < data.blocks.length; i++) {
			const dt = data.blocks[i].timestamp - data.blocks[i - 1].timestamp
			if (dt > 0) diffs.push(dt)
		}
		if (diffs.length === 0) return 0
		return diffs.reduce((a, b) => a + b, 0) / diffs.length
	}, [data])

	if (live == null) {
		return (
			<BentoTile
				title="Latest block"
				span={{ base: 2, sm: 2, lg: 2 }}
				rowSpan={{ base: 1, lg: 1 }}
				status="empty"
				empty={{ icon: <ActivityIcon />, label: 'Waiting for blocks' }}
			/>
		)
	}

	return (
		<BentoTile
			title="Latest block"
			span={{ base: 2, sm: 2, lg: 2 }}
			rowSpan={{ base: 1, lg: 1 }}
			contentClassName="justify-end gap-1"
		>
			<BlockTickPulse value={live}>
				<div className="[&>div>span]:text-[34px] [&>div>span]:gap-[1px]">
					<BlockCard.BlockNumber value={live} />
				</div>
			</BlockTickPulse>
			<span className="text-[11px] text-tertiary tabular-nums">
				{avgBlockTime ? `${avgBlockTime.toFixed(2)}s / block` : '\u00a0'}
			</span>
		</BentoTile>
	)
}

/**
 * Wraps the block number in a thin shell that runs a one-shot box-shadow
 * pulse animation each time `value` changes. Re-applies the animation by
 * toggling a CSS variable / class via `key`, which is the cheapest way to
 * restart a keyframe in React.
 */
function BlockTickPulse(props: {
	value: bigint
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<div
			key={props.value.toString()}
			className="inline-flex rounded-md will-change-[box-shadow]"
			style={{ animation: 'blockTickFlash 600ms ease-out' }}
		>
			{props.children}
		</div>
	)
}
