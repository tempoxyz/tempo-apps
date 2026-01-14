import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'
import { formatUnits, parseUnits, type Address, type Hex } from 'viem'
import { createPortal } from 'react-dom'
import { useReadContract, useReadContracts, useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi'
import { Layout } from '#comps/Layout'
import { cx } from '#lib/css'
import { useCopy } from '#lib/hooks'
import { MULTISIG_ABI, decodeMultisigCall, getCallIcon } from '#lib/multisig'
import ArrowLeftIcon from '~icons/lucide/arrow-left'
import CopyIcon from '~icons/lucide/copy'
import CheckIcon from '~icons/lucide/check'
import UsersIcon from '~icons/lucide/users'
import ClockIcon from '~icons/lucide/clock'
import ShieldIcon from '~icons/lucide/shield'
import XCircleIcon from '~icons/lucide/x-circle'
import CheckCircleIcon from '~icons/lucide/check-circle'
import PlayIcon from '~icons/lucide/play'
import UndoIcon from '~icons/lucide/undo'

import SendIcon from '~icons/lucide/send'
import PlusIcon from '~icons/lucide/plus'
import MinusIcon from '~icons/lucide/minus'
import RepeatIcon from '~icons/lucide/repeat'
import DownloadIcon from '~icons/lucide/download'
import UploadIcon from '~icons/lucide/upload'
import PlusCircleIcon from '~icons/lucide/plus-circle'
import SettingsIcon from '~icons/lucide/settings'
import CodeIcon from '~icons/lucide/code'
import XIcon from '~icons/lucide/x'
import WalletIcon from '~icons/lucide/wallet'
import ExternalLinkIcon from '~icons/lucide/external-link'

export const Route = createFileRoute('/_layout/multisig/$address')({
	component: MultisigDashboard,
})

type MultisigTx = {
	id: bigint
	to: Address
	value: bigint
	data: Hex
	executed: boolean
	cancelled: boolean
	confirmations: bigint
	cancelConfirmations: bigint
	submitTime: bigint
	expiresAt: bigint
	gasLimit: bigint
	submitter: Address
	confirmedBy: Address[]
}

function shortenAddress(addr: string, chars = 4): string {
	return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`
}

function getIconComponent(iconName: string) {
	const icons: Record<string, React.ComponentType<{ className?: string }>> = {
		send: SendIcon,
		plus: PlusIcon,
		minus: MinusIcon,
		'check-circle': CheckCircleIcon,
		repeat: RepeatIcon,
		download: DownloadIcon,
		upload: UploadIcon,
		'plus-circle': PlusCircleIcon,
		'x-circle': XCircleIcon,
		settings: SettingsIcon,
		code: CodeIcon,
	}
	return icons[iconName] || CodeIcon
}

function MultisigDashboard() {
	const { address } = Route.useParams()
	const account = useAccount()
	const { notifying: copied, copy } = useCopy()

	const { data: threshold } = useReadContract({
		address: address as Address,
		abi: MULTISIG_ABI,
		functionName: 'threshold',
	})

	const { data: owners } = useReadContract({
		address: address as Address,
		abi: MULTISIG_ABI,
		functionName: 'getOwners',
	})

	const { data: txCount } = useReadContract({
		address: address as Address,
		abi: MULTISIG_ABI,
		functionName: 'getTxCount',
	})

	const { data: nativeBalance } = useBalance({
		address: address as Address,
	})

	const txIds = React.useMemo(() => {
		if (!txCount) return []
		const count = Number(txCount)
		return Array.from({ length: Math.min(count, 20) }, (_, i) => BigInt(count - 1 - i))
	}, [txCount])

	const txQueries = useReadContracts({
		contracts: txIds.flatMap((id) => [
			{
				address: address as Address,
				abi: MULTISIG_ABI,
				functionName: 'getTx',
				args: [id],
			},
			{
				address: address as Address,
				abi: MULTISIG_ABI,
				functionName: 'getConfirmations',
				args: [id],
			},
		]),
	})

	const transactions: MultisigTx[] = React.useMemo(() => {
		if (!txQueries.data) return []
		const txs: MultisigTx[] = []
		for (let i = 0; i < txIds.length; i++) {
			const txResult = txQueries.data[i * 2]
			const confirmResult = txQueries.data[i * 2 + 1]
			if (txResult?.result && confirmResult?.result) {
				const [to, value, data, executed, cancelled, confirmations, cancelConfirmations, submitTime, expiresAt, gasLimit, submitter] = txResult.result as [Address, bigint, Hex, boolean, boolean, bigint, bigint, bigint, bigint, bigint, Address]
				txs.push({
					id: txIds[i],
					to,
					value,
					data,
					executed,
					cancelled,
					confirmations,
					cancelConfirmations,
					submitTime,
					expiresAt,
					gasLimit,
					submitter,
					confirmedBy: confirmResult.result as Address[],
				})
			}
		}
		return txs
	}, [txIds, txQueries.data])

	const isOwner = React.useMemo(() => {
		if (!owners || !account.address) return false
		return owners.some((o) => o.toLowerCase() === account.address?.toLowerCase())
	}, [owners, account.address])

	const [showSubmitModal, setShowSubmitModal] = React.useState(false)

	return (
		<>
			<Layout.Header
				left={
					<Link
						to="/multisig"
						className="flex items-center gap-1.5 text-secondary hover:text-primary transition-colors press-down"
					>
						<ArrowLeftIcon className="size-4" />
						<span className="text-[13px]">Multisig</span>
					</Link>
				}
				right={null}
			/>
			<div className="flex flex-col flex-1 w-full max-w-2xl mx-auto px-4 py-6 gap-6">
				{/* Header */}
				<div className="flex flex-col gap-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="flex items-center justify-center size-12 rounded-xl glass-thin">
								<ShieldIcon className="size-6 text-accent" />
							</div>
							<div className="flex flex-col gap-0.5 min-w-0">
								<h1 className="font-semibold text-[18px] text-primary">Multisig</h1>
								<button
									type="button"
									onClick={() => copy(address)}
									className="flex items-center gap-1 text-secondary hover:text-primary transition-colors text-left"
								>
									<span className="font-mono text-[13px]">{shortenAddress(address, 6)}</span>
									{copied ? (
										<CheckIcon className="size-3 text-positive" />
									) : (
										<CopyIcon className="size-3" />
									)}
								</button>
							</div>
						</div>
						<a
							href={`https://explore.mainnet.tempo.xyz/address/${address}`}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg glass-thin text-secondary hover:text-primary text-[12px] press-down transition-colors"
						>
							<ExternalLinkIcon className="size-3.5" />
							Explorer
						</a>
					</div>

					{/* Balance */}
					{nativeBalance && nativeBalance.value > 0n && (
						<div className="flex items-center gap-3 p-4 rounded-xl glass-thin">
							<WalletIcon className="size-5 text-accent" />
							<div className="flex flex-col">
								<span className="text-tertiary text-[11px] uppercase tracking-wide">Balance</span>
								<span className="text-primary font-semibold text-[18px] font-mono">
									{formatUnits(nativeBalance.value, nativeBalance.decimals)} {nativeBalance.symbol}
								</span>
							</div>
						</div>
					)}

					{/* Stats */}
					<div className="grid grid-cols-3 gap-3">
						<div className="flex flex-col gap-1 p-3 rounded-xl glass-thin">
							<span className="text-tertiary text-[11px] uppercase tracking-wide">Threshold</span>
							<span className="text-primary font-semibold text-[18px]">
								{threshold !== undefined ? `${threshold}/${owners?.length ?? '?'}` : '—'}
							</span>
						</div>
						<div className="flex flex-col gap-1 p-3 rounded-xl glass-thin">
							<span className="text-tertiary text-[11px] uppercase tracking-wide">Owners</span>
							<span className="text-primary font-semibold text-[18px]">
								{owners?.length ?? '—'}
							</span>
						</div>
						<div className="flex flex-col gap-1 p-3 rounded-xl glass-thin">
							<span className="text-tertiary text-[11px] uppercase tracking-wide">Transactions</span>
							<span className="text-primary font-semibold text-[18px]">
								{txCount !== undefined ? txCount.toString() : '—'}
							</span>
						</div>
					</div>

					{/* Owners List */}
					{owners && owners.length > 0 && (
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-1.5">
								<UsersIcon className="size-3.5 text-tertiary" />
								<span className="text-tertiary text-[12px] uppercase tracking-wide">Owners</span>
							</div>
							<div className="flex flex-wrap gap-1.5">
								{owners.map((owner) => (
									<a
										key={owner}
										href={`https://explore.mainnet.tempo.xyz/address/${owner}`}
										target="_blank"
										rel="noopener noreferrer"
										className={cx(
											'flex items-center gap-1 px-2 py-1 rounded-full glass-thin text-[11px] font-mono',
											'hover:glass transition-all press-down',
											owner.toLowerCase() === account.address?.toLowerCase()
												? 'text-accent border border-accent/30'
												: 'text-secondary',
										)}
									>
										{shortenAddress(owner)}
										{owner.toLowerCase() === account.address?.toLowerCase() && (
											<span className="text-[10px] text-accent">(you)</span>
										)}
									</a>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Transactions */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<h2 className="text-secondary text-[13px] uppercase tracking-wide">Transactions</h2>
						{isOwner && (
							<button
								type="button"
								onClick={() => setShowSubmitModal(true)}
								className="flex items-center gap-1 px-2.5 py-1 rounded-lg glass-button-accent text-[11px] font-medium press-down"
							>
								<PlusIcon className="size-3" />
								New
							</button>
						)}
					</div>
					{transactions.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 gap-3 glass-thin rounded-xl">
							<ShieldIcon className="size-8 text-tertiary" />
							<span className="text-tertiary text-[14px]">No transactions yet</span>
						</div>
					) : (
						<div className="flex flex-col gap-2">
							{transactions.map((tx) => (
								<TransactionCard
									key={tx.id.toString()}
									tx={tx}
									threshold={threshold ?? 0n}
									multisigAddress={address as Address}
									isOwner={isOwner}
									userAddress={account.address}
								/>
							))}
						</div>
					)}
				</div>
			</div>
			{showSubmitModal &&
				createPortal(
					<SubmitTransactionModal
						multisigAddress={address as Address}
						onClose={() => setShowSubmitModal(false)}
					/>,
					document.body,
				)}
		</>
	)
}

function SubmitTransactionModal({
	multisigAddress,
	onClose,
}: {
	multisigAddress: Address
	onClose: () => void
}) {
	const [isVisible, setIsVisible] = React.useState(false)
	const [to, setTo] = React.useState('')
	const [value, setValue] = React.useState('')
	const [data, setData] = React.useState('0x')
	const [gasLimit, setGasLimit] = React.useState('100000')
	const [expiryHours, setExpiryHours] = React.useState('24')

	const { writeContract: submit, isPending, data: submitHash, error } = useWriteContract()
	const { isLoading: isWaiting, isSuccess } = useWaitForTransactionReceipt({ hash: submitHash })

	const handleClose = React.useCallback(() => {
		setIsVisible(false)
		setTimeout(onClose, 200)
	}, [onClose])

	React.useEffect(() => {
		requestAnimationFrame(() => setIsVisible(true))
	}, [])

	React.useEffect(() => {
		if (isSuccess) handleClose()
	}, [isSuccess, handleClose])

	React.useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') handleClose()
		}
		document.addEventListener('keydown', handleEscape)
		return () => document.removeEventListener('keydown', handleEscape)
	}, [handleClose])

	const isValidTo = to.startsWith('0x') && to.length === 42
	const isValidData = data.startsWith('0x')

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		if (!isValidTo || !isValidData) return

		const expirySeconds = BigInt(Number(expiryHours) * 3600)
		const expiresAt = BigInt(Math.floor(Date.now() / 1000)) + expirySeconds

		submit({
			address: multisigAddress,
			abi: MULTISIG_ABI,
			functionName: 'submit',
			args: [
				to as Address,
				parseUnits(value || '0', 18),
				data as Hex,
				BigInt(gasLimit),
				expiresAt,
			],
		})
	}

	return (
		<div
			className={cx(
				'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-200',
				isVisible ? 'opacity-100' : 'opacity-0',
			)}
			onClick={handleClose}
		>
			<div
				className={cx(
					'w-full max-w-md mx-4 glass rounded-2xl transition-all duration-200',
					isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4',
				)}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between p-4 border-b border-base-border">
					<h2 className="text-primary font-semibold text-[16px]">Submit Transaction</h2>
					<button
						type="button"
						onClick={handleClose}
						className="p-1 rounded-lg hover:bg-base-alt transition-colors"
					>
						<XIcon className="size-5 text-tertiary" />
					</button>
				</div>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
					<div className="flex flex-col gap-1.5">
						<label className="text-[12px] text-tertiary">To Address</label>
						<input
							type="text"
							value={to}
							onChange={(e) => setTo(e.target.value)}
							placeholder="0x..."
							className="glass-input px-3 py-2 rounded-lg text-[14px] font-mono"
							spellCheck={false}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<label className="text-[12px] text-tertiary">Value (ETH)</label>
						<input
							type="text"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder="0"
							className="glass-input px-3 py-2 rounded-lg text-[14px] font-mono"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<label className="text-[12px] text-tertiary">Calldata</label>
						<textarea
							value={data}
							onChange={(e) => setData(e.target.value)}
							placeholder="0x"
							rows={3}
							className="glass-input px-3 py-2 rounded-lg text-[14px] font-mono resize-none"
							spellCheck={false}
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="flex flex-col gap-1.5">
							<label className="text-[12px] text-tertiary">Gas Limit</label>
							<input
								type="text"
								value={gasLimit}
								onChange={(e) => setGasLimit(e.target.value)}
								className="glass-input px-3 py-2 rounded-lg text-[14px] font-mono"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<label className="text-[12px] text-tertiary">Expiry (hours)</label>
							<input
								type="text"
								value={expiryHours}
								onChange={(e) => setExpiryHours(e.target.value)}
								className="glass-input px-3 py-2 rounded-lg text-[14px] font-mono"
							/>
						</div>
					</div>
					{error && (
						<div className="px-3 py-2 rounded-lg bg-negative/10 border border-negative/30">
							<p className="text-negative text-[12px]">{error.message}</p>
						</div>
					)}
					<button
						type="submit"
						disabled={!isValidTo || !isValidData || isPending || isWaiting}
						className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg glass-button-accent font-medium text-[14px] press-down disabled:opacity-50"
					>
						{isPending || isWaiting ? (
							<span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
						) : (
							<>
								<SendIcon className="size-4" />
								Submit
							</>
						)}
					</button>
				</form>
			</div>
		</div>
	)
}

function TransactionCard({
	tx,
	threshold,
	multisigAddress,
	isOwner,
	userAddress,
}: {
	tx: MultisigTx
	threshold: bigint
	multisigAddress: Address
	isOwner: boolean
	userAddress?: Address
}) {
	const decoded = React.useMemo(() => decodeMultisigCall(tx.to, tx.value, tx.data), [tx.to, tx.value, tx.data])
	const IconComponent = decoded ? getIconComponent(getCallIcon(decoded)) : CodeIcon

	const isExpired = tx.expiresAt > 0n && BigInt(Math.floor(Date.now() / 1000)) > tx.expiresAt
	const canExecute = tx.confirmations >= threshold && !tx.executed && !tx.cancelled && !isExpired
	const hasConfirmed = userAddress && tx.confirmedBy.some((a) => a.toLowerCase() === userAddress.toLowerCase())

	const { writeContract: confirm, isPending: isConfirming, data: confirmHash } = useWriteContract()
	const { writeContract: revoke, isPending: isRevoking, data: revokeHash } = useWriteContract()
	const { writeContract: execute, isPending: isExecuting, data: executeHash } = useWriteContract()

	const { isLoading: isConfirmWaiting } = useWaitForTransactionReceipt({ hash: confirmHash })
	const { isLoading: isRevokeWaiting } = useWaitForTransactionReceipt({ hash: revokeHash })
	const { isLoading: isExecuteWaiting } = useWaitForTransactionReceipt({ hash: executeHash })

	const handleConfirm = () => {
		confirm({
			address: multisigAddress,
			abi: MULTISIG_ABI,
			functionName: 'confirm',
			args: [tx.id],
		})
	}

	const handleRevoke = () => {
		revoke({
			address: multisigAddress,
			abi: MULTISIG_ABI,
			functionName: 'revoke',
			args: [tx.id],
		})
	}

	const handleExecute = () => {
		execute({
			address: multisigAddress,
			abi: MULTISIG_ABI,
			functionName: 'execute',
			args: [tx.id],
		})
	}

	return (
		<div
			className={cx(
				'flex flex-col gap-3 p-4 rounded-xl glass-thin',
				tx.executed && 'opacity-60',
				tx.cancelled && 'opacity-40',
			)}
		>
			{/* Header */}
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-2.5 min-w-0">
					<div
						className={cx(
							'flex items-center justify-center size-9 rounded-lg shrink-0',
							tx.executed
								? 'bg-positive/20 text-positive'
								: tx.cancelled
									? 'bg-negative/20 text-negative'
									: 'glass-thin text-accent',
						)}
					>
						<IconComponent className="size-4" />
					</div>
					<div className="flex flex-col gap-0.5 min-w-0">
						<span className="text-primary text-[14px] font-medium truncate">
							{decoded?.description ?? 'Unknown Call'}
						</span>
						<span className="text-tertiary text-[12px]">
							#{tx.id.toString()} · {decoded?.targetName ?? shortenAddress(tx.to)}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					{tx.executed ? (
						<span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-positive/20 text-positive text-[11px]">
							<CheckCircleIcon className="size-3" />
							Executed
						</span>
					) : tx.cancelled ? (
						<span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-negative/20 text-negative text-[11px]">
							<XCircleIcon className="size-3" />
							Cancelled
						</span>
					) : isExpired ? (
						<span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/20 text-warning text-[11px]">
							<ClockIcon className="size-3" />
							Expired
						</span>
					) : (
						<span className="flex items-center gap-1 px-2 py-0.5 rounded-full glass-thin text-secondary text-[11px]">
							<ClockIcon className="size-3" />
							Pending
						</span>
					)}
				</div>
			</div>

			{/* Confirmations */}
			<div className="flex items-center gap-2">
				<div className="flex items-center gap-1">
					<UsersIcon className="size-3 text-tertiary" />
					<span className="text-[12px] text-secondary">
						{tx.confirmations.toString()}/{threshold.toString()} confirmations
					</span>
				</div>
				{tx.confirmedBy.length > 0 && (
					<div className="flex items-center gap-1">
						{tx.confirmedBy.slice(0, 3).map((addr) => (
							<span
								key={addr}
								className="px-1.5 py-0.5 rounded-full glass-thin text-[10px] font-mono text-tertiary"
							>
								{shortenAddress(addr, 2)}
							</span>
						))}
						{tx.confirmedBy.length > 3 && (
							<span className="text-tertiary text-[10px]">+{tx.confirmedBy.length - 3}</span>
						)}
					</div>
				)}
			</div>

			{/* Value if non-zero */}
			{tx.value > 0n && (
				<div className="flex items-center gap-1 text-[12px]">
					<span className="text-tertiary">Value:</span>
					<span className="text-primary font-mono">{formatUnits(tx.value, 18)} ETH</span>
				</div>
			)}

			{/* Args preview */}
			{decoded && decoded.args.length > 0 && (
				<div className="flex flex-col gap-1 p-2 rounded-lg bg-base-alt/30">
					{decoded.args.slice(0, 3).map((arg) => (
						<div key={arg.name} className="flex items-center gap-2 text-[11px]">
							<span className="text-tertiary min-w-[60px]">{arg.name}:</span>
							<span className="text-secondary font-mono truncate">{arg.displayValue}</span>
						</div>
					))}
					{decoded.args.length > 3 && (
						<span className="text-tertiary text-[10px]">+{decoded.args.length - 3} more</span>
					)}
				</div>
			)}

			{/* Actions */}
			{isOwner && !tx.executed && !tx.cancelled && !isExpired && (
				<div className="flex items-center gap-2 pt-1">
					{!hasConfirmed ? (
						<button
							type="button"
							onClick={handleConfirm}
							disabled={isConfirming || isConfirmWaiting}
							className="flex items-center gap-1 px-3 py-1.5 rounded-lg glass-button-accent text-[12px] font-medium press-down disabled:opacity-50"
						>
							{isConfirming || isConfirmWaiting ? (
								<span className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
							) : (
								<CheckIcon className="size-3" />
							)}
							Confirm
						</button>
					) : (
						<button
							type="button"
							onClick={handleRevoke}
							disabled={isRevoking || isRevokeWaiting}
							className="flex items-center gap-1 px-3 py-1.5 rounded-lg glass-button text-[12px] font-medium press-down disabled:opacity-50"
						>
							{isRevoking || isRevokeWaiting ? (
								<span className="size-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
							) : (
								<UndoIcon className="size-3" />
							)}
							Revoke
						</button>
					)}
					{canExecute && (
						<button
							type="button"
							onClick={handleExecute}
							disabled={isExecuting || isExecuteWaiting}
							className="flex items-center gap-1 px-3 py-1.5 rounded-lg glass-button text-positive text-[12px] font-medium press-down disabled:opacity-50"
						>
							{isExecuting || isExecuteWaiting ? (
								<span className="size-3 border-2 border-positive/30 border-t-positive rounded-full animate-spin" />
							) : (
								<PlayIcon className="size-3" />
							)}
							Execute
						</button>
					)}
				</div>
			)}
		</div>
	)
}
