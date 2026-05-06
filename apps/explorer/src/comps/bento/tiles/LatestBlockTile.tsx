import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { LivePulseDot } from '#comps/bento/LivePulseDot'
import { useLiveBlockNumber } from '#lib/block-number'
import { landingRecentBlocksQueryOptions } from '#lib/queries'
import ActivityIcon from '~icons/lucide/activity'

const PADDED_LEN = 15

export function LatestBlockTile(): React.JSX.Element {
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
				title={
					<>
						<LivePulseDot />
						Latest block
					</>
				}
				span={{ base: 2, sm: 2, lg: 2 }}
				rowSpan={{ base: 1, lg: 1 }}
				status="empty"
				empty={{ icon: <ActivityIcon />, label: 'Waiting for blocks' }}
			/>
		)
	}

	return (
		<BentoTile
			title={
				<>
					<LivePulseDot />
					Latest block
				</>
			}
			span={{ base: 2, sm: 2, lg: 2 }}
			rowSpan={{ base: 1, lg: 1 }}
			contentClassName="justify-end gap-1"
		>
			<DiffingBlockNumber value={live} />
			<span className="text-[11px] text-tertiary tabular-nums">
				{avgBlockTime ? `${avgBlockTime.toFixed(2)}s / block` : '\u00a0'}
			</span>
		</BentoTile>
	)
}

/**
 * Renders the block number padded to {PADDED_LEN} chars in a lotto-style
 * row of digits. Per-digit, we animate ONLY the digits that changed
 * since the previous render — leaving unchanged glyphs static — using
 * the `digitFlash` keyframe defined in routes/styles.css.
 */
function DiffingBlockNumber(props: { value: bigint }): React.JSX.Element {
	const str = String(props.value).padStart(PADDED_LEN, '0')
	const zerosEnd = str.match(/^0*/)?.[0].length ?? 0

	const prevRef = React.useRef<string>(str)
	const prev = prevRef.current
	React.useEffect(() => {
		prevRef.current = str
	}, [str])

	return (
		<div className="font-mono">
			<span className="flex items-end gap-px text-[34px] leading-none text-tertiary select-none">
				{str.split('').map((char, i) => {
					const isPad = i < zerosEnd
					const changed = prev[i] !== char
					return (
						<span
							key={`${i}-${char}`}
							className={isPad ? 'opacity-50' : 'text-primary'}
							style={
								changed && !isPad
									? { animation: 'digitFlash 600ms ease-out' }
									: undefined
							}
						>
							{char}
						</span>
					)
				})}
			</span>
		</div>
	)
}
