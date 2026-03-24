import { Link } from '@tanstack/react-router'
import type { Address, Hex } from 'ox'
import * as Value from 'ox/Value'
import { useState } from 'react'
import { Amount } from '#comps/Amount'
import { Midcut } from '#comps/Midcut'
import { ReceiptMark } from '#comps/ReceiptMark'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { TxEventDescription } from '#comps/TxEventDescription'
import type { KnownEvent } from '#lib/domain/known-events'
import { DateFormatter, PriceFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import { getFeeTokenForChain } from '#lib/tokenlist'
import { getTempoChain } from '#wagmi.config.ts'

const TEMPO_CHAIN_ID = getTempoChain().id
const TEMPO_FEE_TOKEN = getFeeTokenForChain(TEMPO_CHAIN_ID)

export function Receipt(props: Receipt.Props) {
	const {
		blockNumber,
		sender,
		hash,
		timestamp,
		status,
		events = [],
		fee,
		total,
		feeDisplay,
		totalDisplay,
		feeBreakdown = [],
	} = props
	const [hashExpanded, setHashExpanded] = useState(false)
	const copyHash = useCopy()
	const { areTokensListed, isTokenListed } = useTokenListMembership()
	const formattedTime = DateFormatter.formatTimestampTime(timestamp)

	const hasFee = feeDisplay !== undefined || (fee !== undefined && fee !== null)
	const hasTotal =
		totalDisplay !== undefined || (total !== undefined && total !== null)
	const showFeeBreakdown = feeBreakdown.length > 0
	const showUsdFeePrefix = TEMPO_FEE_TOKEN
		? isTokenListed(TEMPO_CHAIN_ID, TEMPO_FEE_TOKEN)
		: true
	const filteredEvents = events.filter(
		(event) =>
			event.type !== 'active key count changed' &&
			event.type !== 'nonce incremented',
	)

	return (
		<>
			<div
				data-receipt
				className="flex flex-col w-[360px] bg-base-alt border border-base-border border-b-0 shadow-[0px_4px_44px_rgba(0,0,0,0.25)] rounded-[10px] rounded-br-none rounded-bl-none text-base-content"
			>
				<div className="flex items-start gap-[40px] px-[20px] pt-[24px] pb-[16px]">
					<div className="shrink-0">
						<ReceiptMark />
					</div>
					<div className="flex flex-col gap-[8px] font-mono text-[13px] leading-[16px] flex-1">
						<div className="flex justify-between items-end">
							<span className="text-tertiary">Block</span>
							<Link
								to="/block/$id"
								params={{ id: blockNumber.toString() }}
								className="text-accent text-right before:content-['#'] press-down"
							>
								{String(blockNumber)}
							</Link>
						</div>
						<div className="flex justify-between items-end gap-4">
							<span className="text-tertiary shrink-0">Sender</span>
							<Link
								to="/address/$address"
								params={{ address: sender }}
								className="text-accent text-right press-down min-w-0 flex-1 flex justify-end"
							>
								<Midcut value={sender} prefix="0x" align="end" />
							</Link>
						</div>
						<div className="flex justify-between items-start gap-4">
							<div className="relative shrink-0">
								<span className="text-tertiary">Hash</span>
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
									className="text-right break-all max-w-[11ch] cursor-pointer press-down min-w-0 flex-1"
								>
									{hash}
								</button>
							) : (
								<button
									type="button"
									onClick={() => setHashExpanded(true)}
									className="text-right cursor-pointer press-down min-w-0 flex-1 flex justify-end"
								>
									<Midcut value={hash} prefix="0x" align="end" />
								</button>
							)}
						</div>
						<div className="flex justify-between items-end">
							<span className="text-tertiary">Date</span>
							<span className="text-right">
								{DateFormatter.formatTimestampDate(timestamp)}
							</span>
						</div>
						<div className="flex justify-between items-end">
							<span className="text-tertiary">Time</span>
							<span className="text-right">
								{formattedTime.time} {formattedTime.timezone}
								<span className="text-tertiary">{formattedTime.offset}</span>
							</span>
						</div>
						{status === 'reverted' && (
							<div className="flex justify-between items-end">
								<span className="text-tertiary">Status</span>
								<span className="text-base-content-negative uppercase text-[11px]">
									Failed
								</span>
							</div>
						)}
					</div>
				</div>
				{filteredEvents.length > 0 && (
					<>
						<div className="border-t border-dashed border-base-border" />
						<div className="flex flex-col gap-3 px-[20px] py-[16px] font-mono text-[13px] leading-4 [counter-reset:event]">
							{filteredEvents.map((event, index) => {
								// Calculate total amount from event parts
								// For swaps, only show the first amount (what's being swapped out)
								const amountParts = event.parts.filter(
									(part) => part.type === 'amount',
								)
								const firstAmountPart = amountParts[0]
								const amountTokenAddresses = amountParts.flatMap((part) =>
									part.type === 'amount' ? [part.value.token] : [],
								)
								const showUsdPrefix =
									amountTokenAddresses.length > 0
										? areTokensListed(TEMPO_CHAIN_ID, amountTokenAddresses)
										: TEMPO_FEE_TOKEN
											? isTokenListed(TEMPO_CHAIN_ID, TEMPO_FEE_TOKEN)
											: true
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
											<div className="grid grid-cols-[1fr_minmax(0,30%)] gap-[10px]">
												<div className="flex flex-row items-start gap-[4px] grow min-w-0 text-tertiary">
													<div className="flex items-center text-tertiary before:content-[counter(event)_'.'] shrink-0 leading-[24px] min-w-[20px]"></div>
													<TxEventDescription event={event} />
												</div>
												<div className="flex items-start justify-end shrink leading-[24px]">
													{totalAmountBigInt > 0n && (
														<Amount.Base
															decimals={decimals}
															infinite={null}
															prefix={showUsdPrefix ? '$' : undefined}
															short
															value={totalAmountBigInt}
														/>
													)}
												</div>
											</div>
											{event.note && (
												<div className="flex flex-row items-center pl-[24px] gap-[11px] overflow-hidden">
													<div className="border-l border-base-border pl-[10px] w-full">
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
																		<div
																			key={key}
																			className="flex gap-2 min-w-0"
																		>
																			<div className="text-tertiary shrink-0">
																				{label}:
																			</div>
																			<div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
																				<TxEventDescription.Part part={part} />
																			</div>
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
										const showUsdPrefix = item.token
											? isTokenListed(TEMPO_CHAIN_ID, item.token)
											: showUsdFeePrefix
										const formattedAmount = showUsdPrefix
											? PriceFormatter.format(item.amount, {
													decimals: item.decimals,
													format: 'short',
												})
											: PriceFormatter.formatAmountShort(
													Value.format(item.amount, item.decimals),
												)
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
															>
																<Midcut value={item.payer} prefix="0x" />
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
													(showUsdFeePrefix
														? PriceFormatter.format(fee ?? 0, {
																format: 'short',
															})
														: PriceFormatter.formatAmountShort(
																String(fee ?? 0),
															))}
											</span>
										</div>
									)}
							{hasTotal && (
								<div className="flex justify-between items-center">
									<span className="text-tertiary">Total</span>
									<span className="text-right">
										{totalDisplay ??
											(showUsdFeePrefix
												? PriceFormatter.format(total ?? 0, { format: 'short' })
												: PriceFormatter.formatAmountShort(String(total ?? 0)))}
									</span>
								</div>
							)}
						</div>
					</>
				)}
			</div>

			<div className="flex flex-col items-center -mt-8 w-full print:hidden">
				<div className="max-w-[360px] w-full">
					<Link
						to="/tx/$hash"
						params={{ hash }}
						className="press-down text-[13px] font-sans px-[12px] py-[12px] flex items-center justify-center gap-[8px] bg-base-plane-interactive border border-base-border rounded-bl-[10px]! rounded-br-[10px]! hover:bg-base-plane text-tertiary hover:text-primary transition-[background-color,color] duration-100 -mt-px focus-visible:-outline-offset-2!"
					>
						<span>View transaction</span>
						<span aria-hidden="true">→</span>
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
		status?: 'success' | 'reverted'
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
