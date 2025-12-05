import { Link } from '@tanstack/react-router'
import type { Address, Hex } from 'ox'
import { useState } from 'react'
import { EventDescription } from '#components/EventDescription'
import { DateFormatter, HexFormatter, PriceFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import type { KnownEvent } from '#lib/known-events'
import { ReceiptMark } from './ReceiptMark'

export function Receipt(props: Receipt.Props) {
	const {
		blockNumber,
		sender,
		hash,
		timestamp,
		events = [],
		fee,
		total,
		feeDisplay,
		totalDisplay,
		feeBreakdown = [],
	} = props
	const [hashExpanded, setHashExpanded] = useState(false)
	const copyHash = useCopy()
	const formattedTime = DateFormatter.formatTimestampTime(timestamp)

	const hasFee = feeDisplay !== undefined || (fee !== undefined && fee !== null)
	const hasTotal =
		totalDisplay !== undefined || (total !== undefined && total !== null)
	const showFeeBreakdown = feeBreakdown.length > 0

	return (
		<>
			<div className="flex flex-col w-[360px] bg-base-plane border border-base-border shadow-[0px_4px_44px_rgba(0,0,0,0.05)] rounded-[10px] text-base-content">
				<div className="flex gap-[40px] px-[20px] pt-[24px] pb-[16px]">
					<div className="shrink-0">
						<ReceiptMark />
					</div>
					<div className="flex flex-col gap-[8px] font-mono text-[13px] leading-[16px] flex-1">
						<div className="flex justify-between items-end">
							<span className="text-tertiary capitalize">Block</span>
							<Link
								to="/block/$id"
								params={{ id: blockNumber.toString() }}
								className="text-accent text-right before:content-['#'] press-down"
							>
								{String(blockNumber)}
							</Link>
						</div>
						<div className="flex justify-between items-end">
							<span className="text-tertiary capitalize">Sender</span>
							<Link
								to="/address/$address"
								params={{ address: sender }}
								className="text-accent text-right press-down"
								title={sender}
							>
								{HexFormatter.shortenHex(sender)}
							</Link>
						</div>
						<div className="flex justify-between items-start">
							<div className="relative">
								<span className="text-tertiary capitalize">Hash</span>
								{copyHash.notifying && (
									<span className="absolute left-[calc(100%+8px)] text-[13px] leading-[16px] text-accent">
										copied
									</span>
								)}
							</div>
							{hashExpanded ? (
								<button
									type="button"
									onClick={() => copyHash.copy(hash)}
									className="text-right break-all max-w-[11ch] cursor-pointer press-down"
								>
									{hash}
								</button>
							) : (
								<button
									type="button"
									onClick={() => setHashExpanded(true)}
									className="text-right cursor-pointer press-down"
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
						<div className="border-t border-dashed border-base-border" />
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
												if (part.type === 'amount')
													return sum + part.value.value
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
												<div className="flex flex-row items-start gap-[4px] grow min-w-0 text-tertiary">
													<div className="flex items-center text-tertiary before:content-[counter(event)_'.'] shrink-0 leading-[24px] min-w-[20px]"></div>
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
													<div className="border-l border-base-border pl-[10px]">
														{typeof event.note === 'string' ? (
															<span
																className="text-tertiary items-end overflow-hidden text-ellipsis whitespace-nowrap"
																title={event.note}
															>
																{event.note}
															</span>
														) : (
															<div className="flex flex-col gap-1 text-secondary text-[13px]">
																{event.note.map(([label, part], index) => {
																	const key = `${label}${index}`
																	return (
																		<div key={key} className="flex gap-2">
																			<div className="text-tertiary">
																				{label}:
																			</div>
																			<EventDescription.Part part={part} />
																		</div>
																	)
																})}
															</div>
														)}
													</div>
												</div>
											)}
										</div>
									</div>
								)
							})}
						</div>
					</>
				)}
				{(showFeeBreakdown || hasFee || hasTotal) && (
					<>
						<div className="border-t border-dashed border-base-border" />
						<div className="flex flex-col gap-2 px-[20px] py-[16px] font-mono text-[13px] leading-4">
							{showFeeBreakdown
								? feeBreakdown.map((item, index) => {
										const formattedAmount = PriceFormatter.format(item.amount, {
											decimals: item.decimals,
											format: 'short',
										})
										const isSponsored =
											item.payer &&
											item.payer.toLowerCase() !== sender.toLowerCase()
										return (
											<div
												key={`${item.token ?? item.symbol ?? 'fee'}-${index}`}
												className="flex flex-wrap gap-2 items-center justify-between"
											>
												<span className="text-tertiary">
													Fee{' '}
													{item.symbol && (
														<span>
															(
															{item.token ? (
																<Link
																	to="/token/$address"
																	params={{ address: item.token }}
																	className="text-base-content-positive press-down"
																>
																	{item.symbol}
																</Link>
															) : (
																<span className="text-base-content-positive">
																	{item.symbol}
																</span>
															)}
															)
														</span>
													)}
												</span>
												<div className="flex items-center gap-1">
													{isSponsored && item.payer && (
														<>
															<Link
																to="/address/$address"
																params={{ address: item.payer }}
																className="text-accent press-down"
																title={item.payer}
															>
																{HexFormatter.shortenHex(item.payer)}
															</Link>
															<span className="text-tertiary">paid</span>
														</>
													)}
													<span>{formattedAmount}</span>
												</div>
											</div>
										)
									})
								: hasFee && (
										<div className="flex justify-between items-center">
											<span className="text-tertiary">Fee</span>
											<span className="text-right">
												{feeDisplay ??
													PriceFormatter.format(fee ?? 0, { format: 'short' })}
											</span>
										</div>
									)}
							{hasTotal && (
								<div className="flex justify-between items-center">
									<span className="text-tertiary">Total</span>
									<span className="text-right">
										{totalDisplay ??
											PriceFormatter.format(total ?? 0, { format: 'short' })}
									</span>
								</div>
							)}
						</div>
					</>
				)}
			</div>

			<div className="flex flex-col items-center -mt-5 w-full">
				<div className="max-w-[360px] w-full">
					<Link
						to="/tx/$hash"
						params={{ hash }}
						className="press-down text-[11px] px-[4px] flex"
					>
						View transaction
					</Link>
				</div>
			</div>
		</>
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
		feeDisplay?: string
		total?: number
		totalDisplay?: string
		feeBreakdown?: FeeBreakdownItem[]
	}

	export interface FeeBreakdownItem {
		amount: bigint
		decimals: number
		symbol?: string
		token?: Address.Address
		payer?: Address.Address
	}
}
