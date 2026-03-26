import * as React from 'react'
import {
	useAccount,
	useConnect,
	useConnectors,
	useDisconnect,
	type Connector,
} from 'wagmi'
import { cx } from '#lib/css'
import { formatAddress } from '#lib/virtual-address'
import type { Address } from 'viem'

export function Header(props: Header.Props): React.JSX.Element {
	const { activeTab, onTabChange } = props
	const { address, isConnected } = useAccount()
	const connect = useConnect()
	const allConnectors = useConnectors() as readonly Connector[]
	const { disconnect } = useDisconnect()

	const connector = React.useMemo(() => {
		const branded = allConnectors.find(
			(c) => c.id !== 'injected' && c.name !== 'Injected',
		)
		return branded ?? allConnectors[0] ?? null
	}, [allConnectors])

	return (
		<header className="border-b border-border px-6 py-3 flex items-center justify-between">
			<div className="flex items-center gap-4">
				<div className="text-base font-semibold tracking-tight">
					Virtual Addresses
				</div>
				<span className="text-label bg-surface-2 px-2 py-0.5 rounded">
					TIP-1022
				</span>
				<nav className="flex items-center gap-1 ml-2">
					<button
						type="button"
						onClick={() => onTabChange('registry')}
						className={cx(
							'px-3 py-1.5 rounded-lg text-sm transition-colors',
							activeTab === 'registry'
								? 'bg-surface-2 text-text-primary font-medium'
								: 'text-text-tertiary hover:text-text-secondary',
						)}
					>
						Registry
					</button>
					<button
						type="button"
						onClick={() => onTabChange('walkthrough')}
						className={cx(
							'px-3 py-1.5 rounded-lg text-sm transition-colors',
							activeTab === 'walkthrough'
								? 'bg-surface-2 text-text-primary font-medium'
								: 'text-text-tertiary hover:text-text-secondary',
						)}
					>
						Walkthrough
					</button>
				</nav>
			</div>
			<div className="flex items-center gap-3">
				<span className="text-label">Tempo Moderato</span>
				{activeTab === 'registry' &&
					(isConnected && address ? (
						<button
							type="button"
							onClick={() => disconnect()}
							className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-sm font-mono text-text-secondary hover:border-border-active transition-colors"
						>
							<span className="w-2 h-2 rounded-full bg-positive" />
							{formatAddress(address as Address)}
						</button>
					) : connector ? (
						<button
							type="button"
							onClick={() => connect.mutate({ connector })}
							className="px-4 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover transition-colors"
						>
							Connect Wallet
						</button>
					) : (
						<span className="text-xs text-text-tertiary">
							No wallet detected
						</span>
					))}
			</div>
		</header>
	)
}

export declare namespace Header {
	type Tab = 'registry' | 'walkthrough'
	type Props = {
		activeTab: Tab
		onTabChange: (tab: Tab) => void
	}
}
