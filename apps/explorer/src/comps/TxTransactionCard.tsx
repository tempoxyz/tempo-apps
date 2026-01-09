import { Link } from '@tanstack/react-router'
import type { Address, Hex } from 'ox'
import { InfoCard } from '#comps/InfoCard'
import { Midcut } from '#comps/Midcut'
import { ReceiptMark } from '#comps/ReceiptMark'
import { FormattedTimestamp, useTimeFormat } from '#comps/TimeFormat'
import { cx } from '#cva.config'
import { useCopy } from '#lib/hooks'
import CopyIcon from '~icons/lucide/copy'

export function TxTransactionCard(props: TxTransactionCard.Props) {
	const { hash, status, blockNumber, timestamp, from, to, className } = props
	const { copy, notifying } = useCopy()
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
	return (
		<InfoCard
			title={
				<div className="flex items-center justify-between px-[18px] h-[36px] font-sans">
					<h1 className="text-[13px] text-tertiary select-none">Transaction</h1>
					<StatusBadge status={status} />
				</div>
			}
			className={className}
			sections={[
				<button
					key="hash"
					type="button"
					onClick={() => copy(hash)}
					className="w-full text-left cursor-pointer press-down text-tertiary"
					title={hash}
				>
					<div className="flex items-center gap-[8px] mb-[8px] font-sans">
						<span className="text-[13px] font-normal capitalize">Hash</span>
						<div className="relative flex items-center">
							<CopyIcon className="w-[12px] h-[12px]" />
							{notifying && (
								<span className="absolute left-[calc(100%+8px)] text-[13px] leading-[16px]">
									copied
								</span>
							)}
						</div>
					</div>
					<p className="text-[14px] font-normal leading-[17px] text-primary break-all max-w-[23ch] font-mono">
						{hash}
					</p>
				</button>,
				{
					label: 'Block',
					value: (
						<Link
							to="/block/$id"
							params={{ id: String(blockNumber) }}
							className="text-[13px] text-accent hover:underline press-down font-mono tabular-nums"
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
							className="text-[13px] text-primary font-mono"
						/>
					),
				},
				{
					label: 'From',
					value: (
						<Link
							to="/address/$address"
							params={{ address: from }}
							className="text-[13px] text-accent hover:underline press-down w-full font-mono max-w-[18ch]"
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
									className="text-[13px] text-accent hover:underline press-down w-full font-mono max-w-[18ch]"
									title={to}
								>
									<Midcut value={to} prefix="0x" min={4} align="end" />
								</Link>
							),
						}
					: {
							label: 'To',
							value: (
								<span className="text-[13px] text-tertiary">
									Contract Creation
								</span>
							),
						},
				<Link
					key="receipt"
					to="/receipt/$hash"
					params={{ hash }}
					className="press-down flex items-end justify-between w-full print:hidden py-[6px]"
				>
					<span className="text-[13px] text-tertiary">Receipt</span>
					<ReceiptMark />
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
		blockNumber: bigint
		timestamp: bigint
		from: Address.Address
		to: Address.Address | null
		className?: string
	}
}
