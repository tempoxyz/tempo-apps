import * as React from 'react'
import { getBlockNumber } from 'wagmi/actions'
import { getWagmiConfig } from '#wagmi.config'

type Listener = () => void

const BLOCK_NUMBER_POLL_INTERVAL_MS = 2_000
const BLOCK_NUMBER_ANIMATION_INTERVAL_MS = 500
const BLOCK_NUMBER_SKEW_SNAP_THRESHOLD = 12n

let confirmedBlockNumber: bigint | null = null
let displayedBlockNumber: bigint | null = null

const confirmedListeners = new Set<Listener>()
const displayedListeners = new Set<Listener>()

const notifyConfirmed = () => {
	for (const listener of confirmedListeners) listener()
}

const notifyDisplayed = () => {
	for (const listener of displayedListeners) listener()
}

const getConfirmedSnapshot = () => confirmedBlockNumber

const getDisplayedSnapshot = () => displayedBlockNumber

const subscribeConfirmed = (listener: Listener) => {
	confirmedListeners.add(listener)
	return () => confirmedListeners.delete(listener)
}

const subscribeDisplayed = (listener: Listener) => {
	displayedListeners.add(listener)
	return () => displayedListeners.delete(listener)
}

const setConfirmedBlockNumber = (next: bigint) => {
	if (confirmedBlockNumber !== next) {
		confirmedBlockNumber = next
		notifyConfirmed()
	}

	if (displayedBlockNumber == null) {
		displayedBlockNumber = next
		notifyDisplayed()
	}
}

const setDisplayedBlockNumber = (next: bigint) => {
	if (displayedBlockNumber === next) return
	displayedBlockNumber = next
	notifyDisplayed()
}

export function syncBlockNumberAtLeast(next: bigint) {
	if (confirmedBlockNumber == null || next > confirmedBlockNumber) {
		setConfirmedBlockNumber(next)
	}
}

export function useLiveBlockNumber(initial?: bigint) {
	const getServerSnapshot = React.useCallback(() => initial, [initial])
	const snapshot = React.useSyncExternalStore(
		subscribeConfirmed,
		getConfirmedSnapshot,
		getServerSnapshot,
	)
	return snapshot ?? initial
}

export function useAnimatedBlockNumber(initial?: bigint) {
	const getServerSnapshot = React.useCallback(() => initial, [initial])
	const snapshot = React.useSyncExternalStore(
		subscribeDisplayed,
		getDisplayedSnapshot,
		getServerSnapshot,
	)
	return snapshot ?? initial
}

export function BlockNumberProvider(
	props: BlockNumberProvider.Props,
): React.JSX.Element {
	const { initial, children } = props
	const config = React.useMemo(() => getWagmiConfig(), [])
	const initialized = React.useRef(false)
	const pollerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
	const animatorRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
	const isPollingRef = React.useRef(false)

	const pollBlockNumber = React.useCallback(async () => {
		if (isPollingRef.current) return
		isPollingRef.current = true
		try {
			const latest = await getBlockNumber(config)
			setConfirmedBlockNumber(latest)
		} catch {
		} finally {
			isPollingRef.current = false
		}
	}, [config])

	React.useEffect(() => {
		if (initialized.current) return
		initialized.current = true
		if (initial != null) setConfirmedBlockNumber(initial)
	}, [initial])

	React.useEffect(() => {
		void pollBlockNumber()
		pollerRef.current = setInterval(
			pollBlockNumber,
			BLOCK_NUMBER_POLL_INTERVAL_MS,
		)
		return () => {
			if (pollerRef.current) {
				clearInterval(pollerRef.current)
				pollerRef.current = null
			}
		}
	}, [pollBlockNumber])

	React.useEffect(() => {
		animatorRef.current = setInterval(() => {
			const confirmed = confirmedBlockNumber
			const displayed = displayedBlockNumber

			if (confirmed == null) return
			if (displayed == null) {
				setDisplayedBlockNumber(confirmed)
				return
			}

			if (displayed > confirmed) {
				setDisplayedBlockNumber(confirmed)
				return
			}

			if (displayed === confirmed) return

			if (confirmed - displayed > BLOCK_NUMBER_SKEW_SNAP_THRESHOLD) {
				setDisplayedBlockNumber(confirmed)
				return
			}

			setDisplayedBlockNumber(displayed + 1n)
		}, BLOCK_NUMBER_ANIMATION_INTERVAL_MS)

		return () => {
			if (animatorRef.current) {
				clearInterval(animatorRef.current)
				animatorRef.current = null
			}
		}
	}, [])

	return <>{children}</>
}

export declare namespace BlockNumberProvider {
	type Props = {
		initial?: bigint
		children: React.ReactNode
	}
}
