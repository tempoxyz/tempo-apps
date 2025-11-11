import type { Address, Hex } from 'ox'
import { useState } from 'react'
import {
	formatTimestampDate,
	formatTimestampTime,
	shortenHex,
} from '#formatting.ts'
import type { KnownEvent } from '#known-events.ts'
import { useCopy } from '#react-utils.ts'
import { Amount } from './Amount.tsx'
import { ReceiptMark } from './ReceiptMark.tsx'

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
	return (
		<div className="flex flex-col w-[360px] bg-base-plane border border-border-base shadow-[0px_4px_44px_rgba(0,0,0,0.05)] rounded-[10px] text-base-content">
			<div className="flex gap-[40px] px-[20px] pt-[24px] pb-[16px]">
				<div className="flex-shrink-0">
					<ReceiptMark />
				</div>
				<div className="flex flex-col gap-[8px] font-mono text-[13px] [line-height:16px] flex-1">
					<div className="flex justify-between items-end">
						<span className="text-tertiary capitalize">Block</span>
						<a
							href={`/explore/block/${blockNumber}`}
							className="text-accent text-right before:content-['#'] active:translate-y-[0.5px]"
						>
							{String(blockNumber)}
						</a>
					</div>
					<div className="flex justify-between items-end">
						<span className="text-tertiary capitalize">Sender</span>
						<a
							href={`/explore/account/${sender}`}
							className="text-accent text-right active:translate-y-[0.5px]"
							title={sender}
						>
							{shortenHex(sender)}
						</a>
					</div>
					<div className="flex justify-between items-start">
						<div className="relative">
							<span className="text-tertiary capitalize">Hash</span>
							{notifying && (
								<span className="absolute left-[calc(100%+8px)] text-[13px] [line-height:16px] text-accent">
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
								{shortenHex(hash)}
							</button>
						)}
					</div>
					<div className="flex justify-between items-end">
						<span className="text-tertiary capitalize">Date</span>
						<span className="text-right">{formatTimestampDate(timestamp)}</span>
					</div>
					<div className="flex justify-between items-end">
						<span className="text-tertiary capitalize">Time</span>
						<span className="text-right">
							{formatTimestampTime(timestamp).time}{' '}
							{formatTimestampTime(timestamp).timezone}
							<span className="text-tertiary">
								{formatTimestampTime(timestamp).offset}
							</span>
						</span>
					</div>
				</div>
			</div>
			<div className="border-t border-dashed border-border-base" />
			<div className="flex flex-col gap-3 px-[20px] py-[16px] font-mono text-[13px] leading-4 [counter-reset:event]">
				{events.map((event, index) => (
					<div
						key={`${event.type}-${index}`}
						className="flex flex-col gap-[8px] [counter-increment:event]"
					>
						<div className="flex flex-row justify-between items-start gap-[10px]">
							<div className="flex flex-row items-start gap-[4px] flex-grow min-w-0 [line-height:24px]">
								<div className="flex flex-row justify-center text-tertiary before:content-[counter(event)_'.'] flex-shrink-0 [line-height:24px]"></div>
								<div className="flex flex-row flex-wrap items-center pl-[4px] gap-[4px] flex-grow">
									{event.parts.map((part, partIndex) => {
										const partKey = `${part.type}-${partIndex}`
										switch (part.type) {
											case 'action':
												return (
													<div
														key={partKey}
														className="flex flex-row justify-center items-center px-[5px] py-[4px] bg-base-alt [line-height:16px]"
													>
														<span className="capitalize items-end">
															{part.value}
														</span>
													</div>
												)
											case 'amount':
												return (
													<Amount
														key={partKey}
														value={part.value.value}
														token={part.value.token}
														decimals={part.value.decimals}
													/>
												)
											case 'token':
												return (
													<span
														key={partKey}
														className="text-base-content-positive items-end"
													>
														{part.value.symbol ||
															shortenHex(part.value.address)}
													</span>
												)
											case 'account':
												return (
													<a
														key={partKey}
														href={`/explore/account/${part.value}`}
														className="text-accent items-end active:translate-y-[0.5px] whitespace-nowrap"
														title={part.value}
													>
														{shortenHex(part.value)}
													</a>
												)
											case 'hex':
												return (
													<span
														key={partKey}
														className="items-end whitespace-nowrap"
														title={part.value}
													>
														{shortenHex(part.value)}
													</span>
												)
											case 'primary':
												return (
													<span key={partKey} className="items-end">
														{part.value}
													</span>
												)
											case 'secondary':
												return (
													<span
														key={partKey}
														className="items-end text-secondary"
													>
														{part.value}
													</span>
												)
											case 'tick':
												return (
													<span key={partKey} className="items-end">
														{part.value}
													</span>
												)
											default:
												return null
										}
									})}
								</div>
							</div>
							<div className="flex text-right flex-shrink-0 [line-height:24px]">
								($0.1)
							</div>
						</div>
						{event.note && (
							<div className="flex flex-row items-center pl-[24px] gap-[11px] overflow-hidden">
								<div className="border-l border-border-base h-[20px] flex-shrink-0" />
								<span
									className="text-tertiary items-end overflow-hidden text-ellipsis whitespace-nowrap"
									title={event.note}
								>
									{event.note}
								</span>
							</div>
						)}
					</div>
				))}
			</div>
			<div className="border-t border-dashed border-border-base" />
			<div className="flex flex-col gap-2 px-[20px] py-[16px] font-mono text-[13px] leading-4">
				<div className="flex justify-between items-center">
					<span className="text-tertiary">Fee</span>
					<span className="text-right">({fee})</span>
				</div>
				<div className="flex justify-between items-center">
					<span className="text-tertiary">Total</span>
					<span className="text-right">({total})</span>
				</div>
			</div>
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
		fee?: string
		total?: string
	}
}
