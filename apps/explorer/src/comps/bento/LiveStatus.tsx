import * as React from 'react'
import { useLiveBlockNumber } from '#lib/block-number'
import { cx } from '#lib/css'

const HEALTHY_THRESHOLD_MS = 10_000

type Status = 'live' | 'stale' | 'offline'

function useOnlineStatus(): boolean {
	const [online, setOnline] = React.useState(() =>
		typeof navigator === 'undefined' ? true : navigator.onLine,
	)
	React.useEffect(() => {
		const onOnline = () => setOnline(true)
		const onOffline = () => setOnline(false)
		window.addEventListener('online', onOnline)
		window.addEventListener('offline', onOffline)
		return () => {
			window.removeEventListener('online', onOnline)
			window.removeEventListener('offline', onOffline)
		}
	}, [])
	return online
}

export function LiveStatus(): React.JSX.Element {
	const block = useLiveBlockNumber()
	const online = useOnlineStatus()
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

	// Poll for staleness once a second so the dot transitions away from
	// "live" without needing a fresh block tick to re-render.
	React.useEffect(() => {
		const id = setInterval(() => force(), 1000)
		return () => clearInterval(id)
	}, [])

	const sinceMs = Date.now() - lastTickRef.current
	const status: Status = !online
		? 'offline'
		: sinceMs <= HEALTHY_THRESHOLD_MS && lastBlockRef.current != null
			? 'live'
			: 'stale'

	const dotClass: Record<Status, string> = {
		live: 'bg-positive',
		stale: 'bg-warning',
		offline: 'bg-negative',
	}
	const haloKeyframe: Record<Status, string> = {
		live: 'liveHalo',
		stale: 'liveHaloWarning',
		offline: 'liveHaloOffline',
	}

	return (
		<span className="flex items-center gap-1.5 text-[11px] text-tertiary">
			<span
				className={cx('size-[7px] rounded-full', dotClass[status])}
				style={{
					animation: `${haloKeyframe[status]} 1.6s ease-out infinite`,
				}}
				aria-hidden
			/>
			{status === 'live' ? (
				<span className="text-secondary">Live</span>
			) : status === 'offline' ? (
				<span>Offline</span>
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
