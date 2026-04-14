import * as React from 'react'
import { useState } from 'react'
import {
	useAccount,
	useWriteContract,
	useWaitForTransactionReceipt,
	useReadContracts,
} from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { cx } from '#lib/css'
import { PATH_USD_ADDRESS, tip20Abi } from '#lib/abi'
import { AddressAnatomy } from './address-anatomy'

export function StepTransfer(props: StepTransfer.Props): React.JSX.Element {
	const { virtualAddress, masterAddress } = props
	const { address: sender } = useAccount()
	const [amount, setAmount] = useState('1')

	const { data: balances, refetch: refetchBalances } = useReadContracts({
		contracts: [
			{
				address: PATH_USD_ADDRESS,
				abi: tip20Abi,
				functionName: 'balanceOf',
				args: [masterAddress as Address],
			},
			{
				address: PATH_USD_ADDRESS,
				abi: tip20Abi,
				functionName: 'balanceOf',
				args: [virtualAddress],
			},
			{
				address: PATH_USD_ADDRESS,
				abi: tip20Abi,
				functionName: 'balanceOf',
				args: [
					(sender ?? '0x0000000000000000000000000000000000000000') as Address,
				],
			},
		],
	})

	const masterBalance = balances?.[0]?.result as bigint | undefined
	const virtualBalance = balances?.[1]?.result as bigint | undefined
	const senderBalance = balances?.[2]?.result as bigint | undefined

	const {
		writeContract,
		data: txHash,
		isPending: isWriting,
		error: writeError,
		reset: resetWrite,
	} = useWriteContract()

	const { isLoading: isConfirming, isSuccess: isConfirmed } =
		useWaitForTransactionReceipt({ hash: txHash })

	React.useEffect(() => {
		if (isConfirmed) {
			refetchBalances()
		}
	}, [isConfirmed, refetchBalances])

	const parsedAmount = React.useMemo(() => {
		try {
			const val = parseUnits(amount, 18)
			return val > 0n ? val : null
		} catch {
			return null
		}
	}, [amount])

	function handleTransfer() {
		if (!sender || !parsedAmount) return
		resetWrite()
		writeContract({
			address: PATH_USD_ADDRESS,
			abi: tip20Abi,
			functionName: 'transfer',
			args: [virtualAddress, parsedAmount],
		})
	}

	function fmt(val: bigint | undefined): string {
		if (val === undefined) return '—'
		return formatUnits(val, 18)
	}

	const isPending = isWriting || isConfirming
	const isDisabled = isPending || !sender || !parsedAmount

	return (
		<div className="glass-card p-6 space-y-5">
			<div>
				<h2 className="text-base font-semibold mb-1">Demo Transfer</h2>
				<p className="text-sm text-text-secondary">
					Send PathUSD to the virtual address. The protocol auto-forwards to the
					master — no sweep transaction needed.
				</p>
			</div>

			<div className="space-y-3">
				<div className="bg-surface-2 rounded-lg p-4">
					<div className="text-label mb-2">Sending to Virtual Address</div>
					<AddressAnatomy address={virtualAddress} />
				</div>

				<div className="grid grid-cols-3 gap-3">
					<div className="bg-surface-2 rounded-lg p-3">
						<div className="text-label mb-1">Sender Balance</div>
						<div className="font-mono text-sm">{fmt(senderBalance)}</div>
						<div className="text-label mt-0.5">PathUSD</div>
					</div>
					<div className="bg-surface-2 rounded-lg p-3">
						<div className="text-label mb-1">Virtual Balance</div>
						<div className="font-mono text-sm text-virtual-magic">
							{fmt(virtualBalance)}
						</div>
						<div className="text-label mt-0.5">PathUSD</div>
					</div>
					<div className="bg-surface-2 rounded-lg p-3">
						<div className="text-label mb-1">Master Balance</div>
						<div className="font-mono text-sm text-positive">
							{fmt(masterBalance)}
						</div>
						<div className="text-label mt-0.5">PathUSD</div>
					</div>
				</div>
			</div>

			<div>
				<div className="text-label mb-1.5">Amount (PathUSD)</div>
				<input
					type="text"
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2.5 font-mono text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
					placeholder="1.0"
				/>
			</div>

			{writeError && (
				<div className="text-sm text-negative bg-negative/10 border border-negative/20 rounded-lg px-4 py-3 break-all">
					{writeError.message.slice(0, 200)}
				</div>
			)}

			{isConfirmed && txHash && (
				<div className="bg-positive/5 border border-positive/20 rounded-lg p-4 space-y-2">
					<div className="flex items-center gap-2 text-positive text-sm font-medium">
						<span>✓</span> Transfer complete — tokens forwarded to master
					</div>
					<a
						href={`https://explore.devnet.tempo.xyz/tx/${txHash}`}
						target="_blank"
						rel="noopener noreferrer"
						className="font-mono text-xs text-accent hover:text-accent-hover break-all"
					>
						{txHash} ↗
					</a>
					<div className="text-xs text-text-secondary mt-2">
						Notice: virtual address balance is{' '}
						<span className="text-virtual-magic font-mono">
							{fmt(virtualBalance)}
						</span>{' '}
						while master balance is{' '}
						<span className="text-positive font-mono">
							{fmt(masterBalance)}
						</span>
					</div>
				</div>
			)}

			<button
				type="button"
				disabled={isDisabled}
				onClick={handleTransfer}
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
						: `Send ${amount} PathUSD to virtual address`}
			</button>

			{!isConfirmed && (
				<div className="text-xs text-text-tertiary border-t border-border pt-4 space-y-1">
					<p>
						<strong className="text-text-secondary">What happens:</strong> The
						TIP-20 precompile detects the virtual address format, resolves the
						masterId to your registered master, and credits the master directly.
						Two Transfer events are emitted:
					</p>
					<ol className="list-decimal list-inside space-y-0.5 ml-2">
						<li>
							<code className="text-text-secondary">
								Transfer(sender → virtual, amount)
							</code>
						</li>
						<li>
							<code className="text-text-secondary">
								Transfer(virtual → master, amount)
							</code>
						</li>
					</ol>
				</div>
			)}
		</div>
	)
}

export declare namespace StepTransfer {
	type Props = {
		virtualAddress: Address
		masterAddress: string
	}
}
