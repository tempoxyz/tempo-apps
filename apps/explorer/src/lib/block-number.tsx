import * as React from 'react'
import { createPublicClient, webSocket } from 'viem'
import { watchBlocks } from 'viem/actions'
import { getBlockNumber } from 'wagmi/actions'
import { getTempoChain, getWagmiConfig } from '#wagmi.config'

type Listener = () => void

// Fallback poll interval for chains without a WebSocket RPC endpoint.
const BLOCK_NUMBER_POLL_INTERVAL_MS = 2_000

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

	// Displayed tracks confirmed in real time so the counter ticks once per
	// incoming block (driven by the WebSocket head subscription below).
	if (displayedBlockNumber == null || next > displayedBlockNumber) {
		displayedBlockNumber = next
		notifyDisplayed()
	}
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

	React.useEffect(() => {
		if (initialized.current) return
		initialized.current = true
		if (initial != null) setConfirmedBlockNumber(initial)
	}, [initial])

	// Track the chain head in real time. Prefer a WebSocket head subscription so
	// the block number ticks the instant a block is produced; fall back to a poll
	// for chains without a WS endpoint.
	React.useEffect(() => {
		const chain = getTempoChain()
		const wsUrl = (chain.rpcUrls.default as { webSocket?: readonly string[] })
			.webSocket?.[0]

		if (wsUrl) {
			const client = createPublicClient({ chain, transport: webSocket(wsUrl) })
			return watchBlocks(client, {
				onBlock: (block) => {
					if (block.number != null) setConfirmedBlockNumber(block.number)
				},
			})
		}

		let cancelled = false
		let inFlight = false
		const poll = async () => {
			if (inFlight) return
			inFlight = true
			try {
				const latest = await getBlockNumber(config)
				if (!cancelled) setConfirmedBlockNumber(latest)
			} catch {
			} finally {
				inFlight = false
			}
		}
		void poll()
		const id = setInterval(poll, BLOCK_NUMBER_POLL_INTERVAL_MS)
		return () => {
			cancelled = true
			clearInterval(id)
		}
	}, [config])

	return <>{children}</>
}

export declare namespace BlockNumberProvider {
	type Props = {
		initial?: bigint
		children: React.ReactNode
	}
}
