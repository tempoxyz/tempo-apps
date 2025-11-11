import { Link } from '@tanstack/react-router'
import { type Address, Hex } from 'ox'
import { useState } from 'react'

import { PriceFormatter, DateFormatter, HexFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import type { KnownEvent } from '#lib/known-events'
import { ReceiptMark } from './ReceiptMark'
import { EventDescription } from '#components/EventDescription'

export function Receipt(props: Receipt.Props) {
	const {
		blockNumber,
		sender,
		hash,
		timestamp,
		events = [],
		fee,
		total,
	} = props
	const [hashExpanded, setHashExpanded] = useState(false)
	const { copy, notifying } = useCopy()
	const formattedTime = DateFormatter.formatTimestampTime(timestamp)
	return (
		<div className="flex flex-col w-[360px] bg-base-plane border border-border-base shadow-[0px_4px_44px_rgba(0,0,0,0.05)] rounded-[10px] text-base-content">
			<div className="flex gap-[40px] px-[20px] pt-[24px] pb-[16px]">
				<div className="shrink-0">
					<ReceiptMark />
				</div>
				<div className="flex flex-col gap-[8px] font-mono text-[13px] leading-[16px] flex-1">
					<div className="flex justify-between items-end">
						<span className="text-tertiary capitalize">Block</span>
						<Link
							to={'/block/$id'}
							params={{ id: Hex.fromNumber(blockNumber) }}
							className="text-accent text-right before:content-['#'] active:translate-y-[0.5px]"
						>
							{String(blockNumber)}
						</Link>
					</div>
					<div className="flex justify-between items-end">
						<span className="text-tertiary capitalize">Sender</span>
						<Link
							to={'/account/$address'}
							params={{ address: sender }}
							className="text-accent text-right active:translate-y-[0.5px]"
							title={sender}
						>
							{HexFormatter.shortenHex(sender)}
						</Link>
					</div>
					<div className="flex justify-between items-start">
						<div className="relative">
							<span className="text-tertiary capitalize">Hash</span>
							{notifying && (
								<span className="absolute left-[calc(100%+8px)] text-[13px] leading-[16px] text-accent">
									copied
								</span>
							)}
						</div>
						{hashExpanded ? (
							<button
								type="button"
								onClick={() => copy(hash)}
								className="text-right break-all max-w-[11ch] cursor-pointer active:translate-y-[0.5px]"
							>
								{hash}
							</button>
						) : (
							<button
								type="button"
								onClick={() => setHashExpanded(true)}
								className="text-right cursor-pointer active:translate-y-[0.5px]"
								title={hash}
							>
								{HexFormatter.shortenHex(hash)}
							</button>
						)}
					</div>
					<div className="flex justify-between items-end">
						<span className="text-tertiary capitalize">Date</span>
						<span className="text-right">
							{DateFormatter.formatTimestampDate(timestamp)}
						</span>
					</div>
					<div className="flex justify-between items-end">
						<span className="text-tertiary capitalize">Time</span>
						<span className="text-right">
							{formattedTime.time} {formattedTime.timezone}
							<span className="text-tertiary">{formattedTime.offset}</span>
						</span>
					</div>
				</div>
			</div>
			{events.length > 0 && (
				<>
					<div className="border-t border-dashed border-border-base" />
					<div className="flex flex-col gap-3 px-[20px] py-[16px] font-mono text-[13px] leading-4 [counter-reset:event]">
						{events.map((event, index) => {
							// Calculate total amount from event parts
							// For swaps, only show the first amount (what's being swapped out)
							const amountParts = event.parts.filter(
								(part) => part.type === 'amount',
							)
							const firstAmountPart = amountParts[0]
							const totalAmountBigInt =
								event.type === 'swap' && amountParts.length > 0
									? firstAmountPart?.type === 'amount'
										? firstAmountPart.value.value
										: 0n
									: amountParts.reduce((sum, part) => {
											if (part.type === 'amount') return sum + part.value.value
											return sum
										}, 0n)
							const decimals =
								firstAmountPart?.type === 'amount'
									? (firstAmountPart.value.decimals ?? 6)
									: 6

							return (
								<div
									key={`${event.type}-${index}`}
									className="[counter-increment:event]"
								>
									<div className="flex flex-col gap-[8px]">
										<div className="flex flex-row justify-between items-start gap-[10px]">
											<div className="flex flex-row items-start gap-[4px] grow min-w-0">
												<div className="flex items-center text-tertiary before:content-[counter(event)_'.'] shrink-0 leading-[24px]"></div>
												<EventDescription event={event} />
											</div>
											<div className="flex items-center text-right shrink-0 leading-[24px]">
												{totalAmountBigInt > 0n && (
													<span
														title={PriceFormatter.format(totalAmountBigInt, {
															decimals,
														})}
													>
														{PriceFormatter.format(totalAmountBigInt, {
															decimals,
															format: 'short',
														})}
													</span>
												)}
											</div>
										</div>
										{event.note && (
											<div className="flex flex-row items-center pl-[24px] gap-[11px] overflow-hidden">
												<div className="border-l border-border-base h-[20px] shrink-0" />
												<span
													className="text-tertiary items-end overflow-hidden text-ellipsis whitespace-nowrap"
													title={event.note}
												>
													{event.note}
												</span>
											</div>
										)}
									</div>
								</div>
							)
						})}
					</div>
				</>
			)}
			{(fee || total) && (
				<>
					<div className="border-t border-dashed border-border-base" />
					<div className="flex flex-col gap-2 px-[20px] py-[16px] font-mono text-[13px] leading-4">
						{fee && (
							<div className="flex justify-between items-center">
								<span className="text-tertiary">Fee</span>
								<span className="text-right" title={PriceFormatter.format(fee)}>
									{PriceFormatter.format(fee, { format: 'short' })}
								</span>
							</div>
						)}
						{total && (
							<div className="flex justify-between items-center">
								<span className="text-tertiary">Total</span>
								<span
									className="text-right"
									title={PriceFormatter.format(total)}
								>
									{PriceFormatter.format(total, { format: 'short' })}
								</span>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	)
}

export namespace Receipt {
	export interface Props {
		blockNumber: bigint
		sender: Address.Address
		hash: Hex.Hex
		timestamp: bigint
		events?: KnownEvent[]
		fee?: number
		total?: number
	}
}
