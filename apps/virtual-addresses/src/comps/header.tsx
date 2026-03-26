import type * as React from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { formatAddress } from '#lib/virtual-address'
import type { Address } from 'viem'

export function Header(): React.JSX.Element {
	const { address, isConnected } = useAccount()
	const { connect } = useConnect()
	const { disconnect } = useDisconnect()

	return (
		<header className="border-b border-border px-6 py-4 flex items-center justify-between">
			<div className="flex items-center gap-3">
				<div className="text-lg font-semibold tracking-tight">
					Virtual Addresses
				</div>
				<span className="text-label bg-surface-2 px-2 py-0.5 rounded">
					TIP-1022
				</span>
			</div>
			<div className="flex items-center gap-3">
				<span className="text-label">Tempo Moderato</span>
				{isConnected && address ? (
					<button
						type="button"
						onClick={() => disconnect()}
						className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-sm font-mono text-text-secondary hover:border-border-active transition-colors"
					>
						<span className="w-2 h-2 rounded-full bg-positive" />
						{formatAddress(address as Address)}
					</button>
				) : (
					<button
						type="button"
						onClick={() => connect({ connector: injected() })}
						className="px-4 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover transition-colors"
					>
						Connect Wallet
					</button>
				)}
			</div>
		</header>
	)
}
