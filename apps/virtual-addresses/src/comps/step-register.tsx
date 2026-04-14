import * as React from 'react'
import {
	useAccount,
	useWriteContract,
	useWaitForTransactionReceipt,
} from 'wagmi'
import { cx } from '#lib/css'
import { VIRTUAL_REGISTRY_ADDRESS, virtualRegistryAbi } from '#lib/abi'
import type { Hex } from 'viem'

export function StepRegister(props: StepRegister.Props): React.JSX.Element {
	const { salt, masterId, minedForAddress, onRegistered } = props
	const { address } = useAccount()

	const addressMismatch =
		address?.toLowerCase() !== minedForAddress.toLowerCase()

	const {
		writeContract,
		data: txHash,
		isPending: isWriting,
		error: writeError,
	} = useWriteContract()

	const { isLoading: isConfirming, isSuccess: isConfirmed } =
		useWaitForTransactionReceipt({
			hash: txHash,
		})

	React.useEffect(() => {
		if (isConfirmed && txHash) {
			onRegistered(txHash)
		}
	}, [isConfirmed, txHash, onRegistered])

	function handleRegister() {
		writeContract({
			address: VIRTUAL_REGISTRY_ADDRESS,
			abi: virtualRegistryAbi,
			functionName: 'registerVirtualMaster',
			args: [salt as Hex],
		})
	}

	const isPending = isWriting || isConfirming
	const isDisabled = isPending || !address || addressMismatch

	return (
		<div className="glass-card p-6 space-y-5">
			<div>
				<h2 className="text-base font-semibold mb-1">Register Master</h2>
				<p className="text-sm text-text-secondary">
					Register your address as a virtual-address master on the TIP-1022
					registry precompile.
				</p>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div className="bg-surface-2 rounded-lg p-4">
					<div className="text-label mb-1">Salt</div>
					<div className="font-mono text-xs text-text-secondary break-all">
						{salt}
					</div>
				</div>
				<div className="bg-surface-2 rounded-lg p-4">
					<div className="text-label mb-1">Master ID</div>
					<div className="font-mono text-sm text-master-id">{masterId}</div>
				</div>
			</div>

			{addressMismatch && (
				<div className="text-sm text-warning bg-warning/10 border border-warning/20 rounded-lg px-4 py-3">
					Salt was mined for{' '}
					<span className="font-mono text-xs">{minedForAddress}</span> but your
					connected wallet is{' '}
					<span className="font-mono text-xs">{address}</span>. Switch back to
					register.
				</div>
			)}

			{writeError && (
				<div className="text-sm text-negative bg-negative/10 border border-negative/20 rounded-lg px-4 py-3 break-all">
					{writeError.message.slice(0, 200)}
				</div>
			)}

			{isConfirmed && txHash && (
				<div className="bg-positive/5 border border-positive/20 rounded-lg p-4 space-y-2">
					<div className="flex items-center gap-2 text-positive text-sm font-medium">
						<span>✓</span> Master registered on-chain
					</div>
					<div>
						<div className="text-label mb-1">Transaction</div>
						<a
							href={`https://explore.devnet.tempo.xyz/tx/${txHash}`}
							target="_blank"
							rel="noopener noreferrer"
							className="font-mono text-xs text-accent hover:text-accent-hover break-all"
						>
							{txHash} ↗
						</a>
					</div>
				</div>
			)}

			{!isConfirmed && (
				<button
					type="button"
					disabled={isDisabled}
					onClick={handleRegister}
					className={cx(
						'w-full py-2.5 rounded-lg text-sm font-medium transition-colors',
						isDisabled
							? 'bg-surface-2 text-text-tertiary cursor-not-allowed'
							: 'bg-accent text-black hover:bg-accent-hover',
					)}
				>
					{isWriting
						? 'Confirm in wallet…'
						: isConfirming
							? 'Confirming…'
							: 'Register Virtual Master'}
				</button>
			)}
		</div>
	)
}

export declare namespace StepRegister {
	type Props = {
		salt: string
		masterId: string
		minedForAddress: string
		onRegistered: (txHash: string) => void
	}
}
