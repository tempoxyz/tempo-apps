import { Link } from '@tanstack/react-router'
import type { Address, Hex } from 'ox'
import { ReceiptMark } from '#components/transaction/receipt/ReceiptMark'
import { InfoCard } from '#components/ui/InfoCard'
import { FormattedTimestamp } from '#components/ui/TimeFormat'
import { cx } from '#cva.config.ts'
import { HexFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import CopyIcon from '~icons/lucide/copy'

export function TransactionCard(props: TransactionCard.Props) {
	const { hash, status, blockNumber, timestamp, from, to, className } = props
	const { copy, notifying } = useCopy()
	return (
		<InfoCard
			title="Transaction"
			secondary={<StatusBadge status={status} />}
			className={className}
			sections={[
				<button
					key="hash"
					type="button"
					onClick={() => copy(hash)}
					className="w-full text-left cursor-pointer press-down text-tertiary"
					title={hash}
				>
					<div className="flex items-center gap-[8px] mb-[8px]">
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
					<p className="text-[14px] font-normal leading-[17px] tracking-[0.02em] text-primary break-all max-w-[23ch]">
						{hash}
					</p>
				</button>,
				{
					label: 'Block',
					value: (
						<Link
							to="/block/$id"
							params={{ id: String(blockNumber) }}
							className="text-[13px] text-accent hover:underline"
						>
							{blockNumber}
						</Link>
					),
				},
				{
					label: 'Time',
					value: (
						<FormattedTimestamp
							timestamp={timestamp}
							format="relative"
							className="text-[13px] text-primary"
						/>
					),
				},
				{
					label: 'From',
					value: (
						<Link
							to="/address/$address"
							params={{ address: from }}
							className="text-[13px] text-accent hover:underline"
							title={from}
						>
							{HexFormatter.truncate(from, 6)}
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
									className="text-[13px] text-accent hover:underline"
									title={to}
								>
									{HexFormatter.truncate(to, 6)}
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
					className="press-down flex items-end justify-between w-full"
				>
					<span className="text-[13px] text-tertiary">View</span>
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
				'text-[11px] uppercase font-normal',
				isSuccess ? 'text-base-content-positive' : 'text-base-content-negative',
			)}
		>
			{isSuccess ? 'Success' : 'Failed'}
		</span>
	)
}

export declare namespace TransactionCard {
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
