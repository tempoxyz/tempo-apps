import type * as React from 'react'
import { useState } from 'react'
import { buildVirtualAddress, randomUserTag } from '#lib/virtual-address'
import { AddressAnatomy } from './address-anatomy'
import type { Hex, Address } from 'viem'

export function StepGenerate(props: StepGenerate.Props): React.JSX.Element {
	const { masterId, masterAddress, onSelectAddress } = props
	const [addresses, setAddresses] = useState<
		Array<{ userTag: Hex; address: Address }>
	>([])

	function generateAddress() {
		const userTag = randomUserTag()
		const addr = buildVirtualAddress(masterId as Hex, userTag)
		setAddresses((prev) => [...prev, { userTag, address: addr }])
	}

	return (
		<div className="glass-card p-6 space-y-5">
			<div>
				<h2 className="text-base font-semibold mb-1">
					Generate Virtual Addresses
				</h2>
				<p className="text-sm text-text-secondary">
					Derive deposit addresses offline from your masterId. Each uses a
					unique 6-byte userTag. No on-chain transaction needed.
				</p>
			</div>

			<div className="bg-surface-2 rounded-lg p-4">
				<div className="text-label mb-1">Master ID</div>
				<div className="font-mono text-sm text-master-id">{masterId}</div>
			</div>

			<button
				type="button"
				onClick={generateAddress}
				className="w-full py-2.5 rounded-lg text-sm font-medium bg-surface-2 text-text-primary border border-border hover:border-border-active transition-colors"
			>
				+ Generate Deposit Address
			</button>

			{addresses.length > 0 && (
				<div className="space-y-3">
					{addresses.map(({ userTag, address }) => (
						<div
							key={address}
							className="bg-surface-2 rounded-lg p-4 space-y-3"
						>
							<div className="flex items-center justify-between">
								<div className="text-label">Tag: {userTag}</div>
								<button
									type="button"
									onClick={() => onSelectAddress(address)}
									className="text-xs text-accent hover:text-accent-hover transition-colors"
								>
									Use for demo transfer →
								</button>
							</div>
							<AddressAnatomy address={address} />
							<a
								href={`https://explore.moderato.tempo.xyz/address/${address}`}
								target="_blank"
								rel="noopener noreferrer"
								className="text-xs text-text-tertiary hover:text-accent transition-colors"
							>
								View on explorer ↗
							</a>
						</div>
					))}
				</div>
			)}

			{addresses.length === 0 && (
				<div className="text-center py-8 text-text-tertiary text-sm">
					No addresses generated yet. Click the button above.
				</div>
			)}

			<div className="text-xs text-text-tertiary border-t border-border pt-4">
				<strong className="text-text-secondary">How it works:</strong> Virtual
				addresses are{' '}
				<span className="font-mono text-master-id">[masterId]</span>
				<span className="font-mono text-virtual-magic">
					[FDFDFDFDFDFDFDFDFDFD]
				</span>
				<span className="font-mono text-user-tag">[userTag]</span>. When anyone
				sends TIP-20 tokens to this address, the protocol auto-forwards to your
				master wallet — {masterAddress.slice(0, 8)}…
			</div>
		</div>
	)
}

export declare namespace StepGenerate {
	type Props = {
		masterId: string
		masterAddress: string
		onSelectAddress: (address: Address) => void
	}
}
