import * as React from 'react'
import { useWatchBlockNumber } from 'wagmi'

const BlockNumberContext = React.createContext<bigint | undefined>(undefined)

export function BlockNumberProvider(props: BlockNumberProvider.Props) {
	const { initial, children } = props
	const [latest, setLatest] = React.useState<bigint | undefined>(initial)

	const onBlockNumber = React.useCallback(
		(bn: bigint) =>
			setLatest((prev) => (prev == null || bn > prev ? bn : prev)),
		[],
	)

	useWatchBlockNumber({ onBlockNumber })

	return (
		<BlockNumberContext.Provider value={latest}>
			{children}
		</BlockNumberContext.Provider>
	)
}

export function useLatestBlockNumber() {
	return React.useContext(BlockNumberContext)
}

export declare namespace BlockNumberProvider {
	type Props = {
		initial?: bigint | undefined
		children: React.ReactNode
	}
}
