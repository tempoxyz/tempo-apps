import * as React from 'react'
import { useLiveBlockNumber } from '#lib/block-number'
import { cx } from '#lib/css'

const HEALTHY_THRESHOLD_MS = 10_000

export function LiveStatus(): React.JSX.Element {
	const block = useLiveBlockNumber()
	const lastTickRef = React.useRef<number>(Date.now())
	const lastBlockRef = React.useRef<bigint | undefined>(undefined)
	const [, force] = React.useReducer((x: number) => x + 1, 0)

	// Whenever the live block tick changes, stamp the time so we can compute
	// how long ago we last heard from the chain.
	React.useEffect(() => {
		if (block != null && block !== lastBlockRef.current) {
			lastBlockRef.current = block
			lastTickRef.current = Date.now()
			force()
		}
	}, [block])

	// Poll for staleness once a second so the dot transitions to yellow
	// without needing a fresh block tick to re-render.
	React.useEffect(() => {
		const id = setInterval(() => force(), 1000)
		return () => clearInterval(id)
	}, [])

	const sinceMs = Date.now() - lastTickRef.current
	const healthy =
		sinceMs <= HEALTHY_THRESHOLD_MS && lastBlockRef.current != null

	return (
		<span className="flex items-center gap-1.5 text-[11px] text-tertiary">
			<span
				className={cx(
					'size-[7px] rounded-full',
					healthy ? 'bg-positive' : 'bg-warning',
				)}
				style={{
					animation: `${healthy ? 'liveHalo' : 'liveHaloWarning'} 1.6s ease-out infinite`,
				}}
				aria-hidden
			/>
			{healthy ? (
				<span className="text-secondary">Live</span>
			) : (
				<span>Last seen {formatRelative(sinceMs)} ago</span>
			)}
		</span>
	)
}

function formatRelative(ms: number): string {
	if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s`
	if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
	if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`
	return `${Math.floor(ms / 86_400_000)}d`
}
