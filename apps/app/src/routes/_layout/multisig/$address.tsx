import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
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
import ExternalLinkIcon from '~icons/lucide/external-link'
import SearchIcon from '~icons/lucide/search'

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

function formatRelativeTime(timestamp: bigint): string {
	const now = Math.floor(Date.now() / 1000)
	const diff = now - Number(timestamp)
	if (diff < 60) return 'just now'
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
	if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
	return new Date(Number(timestamp) * 1000).toLocaleDateString()
}

function formatExpiryCountdown(expiresAt: bigint): string | null {
	if (expiresAt === 0n) return null
	const now = Math.floor(Date.now() / 1000)
	const remaining = Number(expiresAt) - now
	if (remaining <= 0) return null
	if (remaining < 3600) return `${Math.ceil(remaining / 60)}m left`
	if (remaining < 86400) return `${Math.ceil(remaining / 3600)}h left`
	return `${Math.ceil(remaining / 86400)}d left`
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
	const navigate = useNavigate()
	const { notifying: copied, copy } = useCopy()
	const [searchValue, setSearchValue] = React.useState('')
	const [searchFocused, setSearchFocused] = React.useState(false)

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
	const [filter, setFilter] = React.useState<'all' | 'pending' | 'executed'>('all')

	return (
		<>
			<Layout.Header
				left={
					<Link
						to="/multisig"
						className="glass-pill hover:ring-glass flex items-center gap-1 text-secondary hover:text-primary transition-colors"
					>
						<ArrowLeftIcon className="size-2" />
						<span className="text-sm">Back</span>
					</Link>
				}
				right={null}
			/>
			<div className="pb-3">
				{/* Header row with logo and search */}
				<div className="flex items-center justify-between mb-5">
					<Link to="/multisig" className="flex items-center gap-2 press-down">
						<div className="size-[28px] bg-accent rounded-[3px] flex items-center justify-center">
							<ShieldIcon className="size-4 text-white" />
						</div>
					</Link>
					<form
						onSubmit={(e) => {
							e.preventDefault()
							const trimmed = searchValue.trim()
							if (trimmed.match(/^0x[a-fA-F0-9]{40}$/)) {
								navigate({ to: '/multisig/$address', params: { address: trimmed } })
								setSearchValue('')
							}
						}}
						className={cx(
							'flex items-center gap-1.5 pl-2.5 pr-3 h-[36px] rounded-full bg-base-alt transition-colors',
							searchFocused ? 'ring-1 ring-accent/50' : '',
						)}
					>
						<SearchIcon className="size-[14px] text-secondary" />
						<input
							type="text"
							value={searchValue}
							onChange={(e) => setSearchValue(e.target.value)}
							onFocus={() => setSearchFocused(true)}
							onBlur={() => setSearchFocused(false)}
							placeholder="Search multisig"
							className="bg-transparent outline-none text-[13px] text-primary placeholder:text-secondary w-[100px] focus:w-[180px] transition-all"
						/>
					</form>
					<a
						href={`https://explore.mainnet.tempo.xyz/address/${address}`}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center justify-center size-[36px] rounded-full bg-base-alt hover:bg-base-alt/80 transition-colors"
						title="View on Explorer"
					>
						<ExternalLinkIcon className="size-[14px] text-secondary" />
					</a>
				</div>

				{/* Balance and address */}
				<div className="flex flex-row items-start justify-between gap-4 mb-5">
					<div className="flex-1 min-w-0 flex flex-col gap-2">
						<div className="flex items-baseline gap-2">
							<span className="text-[32px] sm:text-[40px] md:text-[48px] font-sans font-semibold text-primary -tracking-[0.02em] tabular-nums">
								{threshold !== undefined ? `${threshold}/${owners?.length ?? '?'}` : '—'}
							</span>
							<span className="text-secondary text-[14px]">threshold</span>
						</div>
						{nativeBalance && nativeBalance.value > 0n && (
							<span className="text-secondary text-[14px] font-mono">
								{formatUnits(nativeBalance.value, nativeBalance.decimals)} {nativeBalance.symbol}
							</span>
						)}
						<div className="flex items-center gap-2 max-w-full">
							<code className="text-[12px] sm:text-[13px] font-mono text-secondary leading-tight min-w-0">
								{address.slice(0, 21)}
								<br />
								{address.slice(21)}
							</code>
							<button
								type="button"
								onClick={() => copy(address)}
								className="flex items-center justify-center size-[28px] rounded-md bg-base-alt hover:bg-base-alt/70 cursor-pointer press-down transition-colors shrink-0"
								title="Copy address"
							>
								{copied ? (
									<CheckIcon className="size-[14px] text-positive" />
								) : (
									<CopyIcon className="size-[14px] text-tertiary" />
								)}
							</button>
						</div>
					</div>
					{/* Stats */}
					<div className="flex flex-col gap-2 text-right">
						<div className="flex items-center gap-1 justify-end">
							<UsersIcon className="size-3.5 text-tertiary" />
							<span className="text-secondary text-[13px]">{owners?.length ?? 0} owners</span>
						</div>
						<div className="flex items-center gap-1 justify-end">
							<ClockIcon className="size-3.5 text-tertiary" />
							<span className="text-secondary text-[13px]">{txCount?.toString() ?? 0} txs</span>
						</div>
					</div>
				</div>

				{/* Owners section */}
				{owners && owners.length > 0 && (
					<div className="rounded-xl border border-card-border bg-card-header mb-2.5">
						<div className="flex items-center h-[44px] px-3">
							<span className="text-[14px] font-medium text-primary">Owners</span>
							<span className="w-px h-4 bg-card-border mx-2" />
							<span className="text-[12px] text-tertiary">{owners.length}</span>
						</div>
						<div className="px-3 pb-3">
							<div className="flex flex-wrap gap-1.5">
								{owners.map((owner) => (
									<a
										key={owner}
										href={`https://explore.mainnet.tempo.xyz/address/${owner}`}
										target="_blank"
										rel="noopener noreferrer"
										className={cx(
											'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono',
											'bg-base-alt hover:bg-base-alt/70 transition-colors press-down',
											owner.toLowerCase() === account.address?.toLowerCase()
												? 'text-accent ring-1 ring-accent/30'
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
					</div>
				)}

				{/* Transactions section */}
				<div className="rounded-xl border border-card-border bg-card-header">
					<div className="flex items-center justify-between h-[44px] px-3">
						<div className="flex items-center gap-2">
							<span className="text-[14px] font-medium text-primary">Transactions</span>
							<div className="flex items-center gap-0.5 p-0.5 rounded-md bg-base-alt">
								{(['all', 'pending', 'executed'] as const).map((f) => (
									<button
										key={f}
										type="button"
										onClick={() => setFilter(f)}
										className={cx(
											'px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer',
											filter === f
												? 'bg-card-header text-primary'
												: 'text-tertiary hover:text-secondary',
										)}
									>
										{f.charAt(0).toUpperCase() + f.slice(1)}
									</button>
								))}
							</div>
						</div>
						{isOwner && (
							<button
								type="button"
								onClick={() => setShowSubmitModal(true)}
								className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent hover:bg-accent/90 text-white text-[11px] font-medium press-down cursor-pointer"
							>
								<PlusIcon className="size-3" />
								New
							</button>
						)}
					</div>
					<div className="px-3 pb-3">
						{(() => {
							const now = BigInt(Math.floor(Date.now() / 1000))
							const filtered = transactions.filter((tx) => {
								if (filter === 'pending') {
									const isExpired = tx.expiresAt > 0n && now > tx.expiresAt
									return !tx.executed && !tx.cancelled && !isExpired
								}
								if (filter === 'executed') return tx.executed
								return true
							})
							if (filtered.length === 0) {
								return (
									<div className="flex flex-col items-center justify-center py-10 gap-2">
										<ShieldIcon className="size-6 text-tertiary" />
										<span className="text-tertiary text-[13px]">
											{transactions.length === 0 ? 'No transactions yet' : 'No matching transactions'}
										</span>
									</div>
								)
							}
							return (
								<div className="flex flex-col gap-2">
									{filtered.map((tx) => (
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
							)
						})()}
					</div>
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
					'w-full max-w-md mx-4 rounded-xl border border-card-border bg-card-header transition-all duration-200',
					isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4',
				)}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between h-[44px] px-3 border-b border-card-border">
					<span className="text-[14px] font-medium text-primary">Submit Transaction</span>
					<button
						type="button"
						onClick={handleClose}
						className="p-1 rounded-md hover:bg-base-alt transition-colors cursor-pointer"
					>
						<XIcon className="size-4 text-tertiary" />
					</button>
				</div>
				<form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3">
					<div className="flex flex-col gap-1">
						<label className="text-[11px] text-tertiary uppercase tracking-wide">To Address</label>
						<input
							type="text"
							value={to}
							onChange={(e) => setTo(e.target.value)}
							placeholder="0x..."
							className="px-3 py-2 rounded-md bg-base-alt text-[13px] font-mono text-primary placeholder:text-tertiary outline-none focus:ring-1 focus:ring-accent/50"
							spellCheck={false}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<label className="text-[11px] text-tertiary uppercase tracking-wide">Value (ETH)</label>
						<input
							type="text"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder="0"
							className="px-3 py-2 rounded-md bg-base-alt text-[13px] font-mono text-primary placeholder:text-tertiary outline-none focus:ring-1 focus:ring-accent/50"
						/>
					</div>
					<div className="flex flex-col gap-1">
						<label className="text-[11px] text-tertiary uppercase tracking-wide">Calldata</label>
						<textarea
							value={data}
							onChange={(e) => setData(e.target.value)}
							placeholder="0x"
							rows={3}
							className="px-3 py-2 rounded-md bg-base-alt text-[13px] font-mono text-primary placeholder:text-tertiary outline-none focus:ring-1 focus:ring-accent/50 resize-none"
							spellCheck={false}
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="flex flex-col gap-1">
							<label className="text-[11px] text-tertiary uppercase tracking-wide">Gas Limit</label>
							<input
								type="text"
								value={gasLimit}
								onChange={(e) => setGasLimit(e.target.value)}
								className="px-3 py-2 rounded-md bg-base-alt text-[13px] font-mono text-primary outline-none focus:ring-1 focus:ring-accent/50"
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label className="text-[11px] text-tertiary uppercase tracking-wide">Expiry (hours)</label>
							<input
								type="text"
								value={expiryHours}
								onChange={(e) => setExpiryHours(e.target.value)}
								className="px-3 py-2 rounded-md bg-base-alt text-[13px] font-mono text-primary outline-none focus:ring-1 focus:ring-accent/50"
							/>
						</div>
					</div>
					{error && (
						<div className="px-3 py-2 rounded-md bg-negative/10 border border-negative/30">
							<p className="text-negative text-[11px]">{error.message}</p>
						</div>
					)}
					<button
						type="submit"
						disabled={!isValidTo || !isValidData || isPending || isWaiting}
						className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-accent hover:bg-accent/90 text-white font-medium text-[13px] press-down disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
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
				'flex flex-col gap-2 p-3 rounded-lg bg-base-alt/50',
				tx.executed && 'opacity-60',
				tx.cancelled && 'opacity-40',
			)}
		>
			{/* Header */}
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-2 min-w-0">
					<div
						className={cx(
							'flex items-center justify-center size-8 rounded-md shrink-0',
							tx.executed
								? 'bg-positive/20 text-positive'
								: tx.cancelled
									? 'bg-negative/20 text-negative'
									: 'bg-base-alt text-accent',
						)}
					>
						<IconComponent className="size-3.5" />
					</div>
					<div className="flex flex-col gap-0.5 min-w-0">
						<span className="text-primary text-[13px] font-medium truncate">
							{decoded?.description ?? 'Unknown Call'}
						</span>
						<span className="text-tertiary text-[11px]">
							#{tx.id.toString()} · {decoded?.targetName ?? shortenAddress(tx.to)} · {formatRelativeTime(tx.submitTime)}
						</span>
					</div>
				</div>
				<div className="shrink-0">
					{tx.executed ? (
						<span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-positive/20 text-positive text-[10px]">
							<CheckCircleIcon className="size-2.5" />
							Done
						</span>
					) : tx.cancelled ? (
						<span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-negative/20 text-negative text-[10px]">
							<XCircleIcon className="size-2.5" />
							Cancelled
						</span>
					) : isExpired ? (
						<span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/20 text-warning text-[10px]">
							<ClockIcon className="size-2.5" />
							Expired
						</span>
					) : (
						<span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-base-alt text-secondary text-[10px]">
							<ClockIcon className="size-2.5" />
							{formatExpiryCountdown(tx.expiresAt) ?? 'Pending'}
						</span>
					)}
				</div>
			</div>

			{/* Confirmations bar */}
			<div className="flex items-center gap-2">
				<div className="flex-1 h-1.5 rounded-full bg-base-alt overflow-hidden">
					<div
						className="h-full bg-accent rounded-full transition-all"
						style={{ width: `${Math.min(100, (Number(tx.confirmations) / Number(threshold)) * 100)}%` }}
					/>
				</div>
				<span className="text-[10px] text-secondary shrink-0">
					{tx.confirmations.toString()}/{threshold.toString()}
				</span>
			</div>

			{/* Value if non-zero */}
			{tx.value > 0n && (
				<div className="flex items-center gap-1 text-[11px]">
					<span className="text-tertiary">Value:</span>
					<span className="text-primary font-mono">{formatUnits(tx.value, 18)} ETH</span>
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
							className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent hover:bg-accent/90 text-white text-[11px] font-medium press-down disabled:opacity-50 cursor-pointer"
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
							className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-base-alt hover:bg-base-alt/70 text-secondary text-[11px] font-medium press-down disabled:opacity-50 cursor-pointer"
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
							className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-positive hover:bg-positive/90 text-white text-[11px] font-medium press-down disabled:opacity-50 cursor-pointer"
						>
							{isExecuting || isExecuteWaiting ? (
								<span className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
