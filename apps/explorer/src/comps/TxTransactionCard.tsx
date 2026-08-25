import { Link } from '@tanstack/react-router'
import type { Address, Hex } from 'ox'
import { InfoCard } from '#comps/InfoCard'
import { Midcut } from '#comps/Midcut'
import { FormattedTimestamp, useTimeFormat } from '#comps/TimeFormat'
import { cx } from '#lib/css'
import { useCopy } from '#lib/hooks'
import CopyIcon from '~icons/lucide/copy'

export function TxTransactionCard(props: TxTransactionCard.Props) {
	const { hash, status, error, blockNumber, timestamp, from, to, className } =
		props
	const { copy, notifying } = useCopy()
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
	return (
		<InfoCard
			title={<InfoCard.Title>Transaction</InfoCard.Title>}
			className={className}
			sections={[
				{
					label: 'Status',
					value: <StatusBadge status={status} />,
				},
				...(status === 'reverted' && error
					? [
							{
								label: 'Error',
								value: (
									<span className="text-right type-card text-primary">
										{error}
									</span>
								),
							},
						]
					: []),
				<button
					key="hash"
					type="button"
					onClick={() => copy(hash)}
					className="w-full text-left cursor-pointer press-down text-tertiary"
					title={hash}
				>
					<div className="flex items-center gap-[8px] mb-[8px] font-sans">
						<span className="capitalize">Hash</span>
						<div className="relative flex items-center">
							<CopyIcon className="w-[12px] h-[12px]" />
							{notifying && (
								<span className="absolute left-[calc(100%+8px)]">copied</span>
							)}
						</div>
					</div>
					{/* 66 chars / 3 lines = 22ch */}
					<p className="type-card-data text-primary break-all max-w-[22ch]">
						{hash}
					</p>
				</button>,
				{
					label: 'Block',
					value: (
						<Link
							to="/block/$id"
							params={{ id: String(blockNumber) }}
							className="text-accent hover:underline press-down font-mono tabular-nums"
						>
							{blockNumber}
						</Link>
					),
				},
				{
					label: (
						<button
							type="button"
							onClick={cycleTimeFormat}
							className="text-tertiary cursor-pointer inline-flex items-center gap-2 group"
							title={`Showing ${formatLabel} time - click to change`}
						>
							<span>Time</span>
							<span className="bg-base-alt text-primary px-2 py-[2px] rounded-[6px] text-[11px] font-sans capitalize transition-colors group-hover:bg-base-alt/80">
								{formatLabel}
							</span>
						</button>
					),
					value: (
						<FormattedTimestamp
							timestamp={timestamp}
							format={timeFormat}
							className="text-primary font-mono"
						/>
					),
				},
				{
					label: 'From',
					value: (
						<Link
							to="/address/$address"
							params={{ address: from }}
							className="text-accent hover:underline press-down w-full font-mono max-w-[50ch]"
							title={from}
						>
							<Midcut value={from} prefix="0x" min={4} align="end" />
						</Link>
					),
				},
				to
					? {
							label: 'To',
							value: (
								<Link
									to="/address/$address"
									params={{ address: to }}
									className="text-accent hover:underline press-down w-full font-mono max-w-[50ch]"
									title={to}
								>
									<Midcut value={to} prefix="0x" min={4} align="end" />
								</Link>
							),
						}
					: {
							label: 'To',
							value: <span className="text-tertiary">Contract Creation</span>,
						},
				<Link
					key="receipt"
					to="/receipt/$hash"
					params={{ hash }}
					className="press-down flex items-center justify-between w-full print:hidden py-[6px]"
				>
					<span className="text-tertiary">Receipt</span>
					<span className="text-[12px] text-tertiary hover:text-primary px-[8px] py-[2px] border border-base-border rounded-full transition-colors">
						View →
					</span>
				</Link>,
				/**
				 * "Why did this fail?" is the most common reason anyone opens a
				 * simulator, and until now there was no way in from the transaction
				 * that raised the question — you retyped every field by hand. `tx`
				 * alone is enough: the simulator loads the transaction, prefills every
				 * call, pins the block to the parent, and runs it.
				 */
				<Link
					key="simulate"
					to="/simulate"
					search={{ tx: hash }}
					className="press-down flex items-center justify-between w-full print:hidden py-[6px]"
					title="Replay this transaction against the state of its parent block"
				>
					<span className="text-tertiary">Simulate</span>
					<span
						className={cx(
							'text-[12px] px-[8px] py-[2px] border rounded-full transition-colors',
							status === 'reverted'
								? 'border-negative/40 text-base-content-negative hover:text-negative'
								: 'border-base-border text-tertiary hover:text-primary',
						)}
					>
						{status === 'reverted' ? 'Debug →' : 'Re-run →'}
					</span>
				</Link>,
			]}
		/>
	)
}

function StatusBadge(props: { status: 'success' | 'reverted' }) {
	const { status } = props
	const isSuccess = status === 'success'
	return (
		<span
			className={cx(
				'text-[11px] uppercase font-mono font-normal px-[6px] py-[2px] rounded-[4px]',
				isSuccess
					? 'text-base-content-positive bg-base-content-positive/10'
					: 'text-base-content-negative bg-base-content-negative/10',
			)}
		>
			{isSuccess ? 'Success' : 'Failed'}
		</span>
	)
}

export declare namespace TxTransactionCard {
	type Props = {
		hash: Hex.Hex
		status: 'success' | 'reverted'
		error?: string | undefined
		blockNumber: bigint
		timestamp: bigint
		from: Address.Address
		to: Address.Address | null
		className?: string
	}
}
