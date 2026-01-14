import { type Address as AddressType, Value } from 'ox'
import * as React from 'react'
import { isAddressEqual } from 'viem'
import { cx } from '#lib/css'
import { TokenIcon } from '#comps/TokenIcon'
import type { KnownEvent, KnownEventPart } from './known-events'
import {
	DateFormatter,
	HexFormatter,
	PriceFormatter,
	RoleFormatter,
} from './formatting'

const EXPLORER_URL = 'https://explore.tempo.xyz'

function shortenAddress(address: string, chars = 4): string {
	return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}

export function TxDescription(props: TxDescription.Props) {
	const { event, seenAs, className, suffix } = props
	return (
		<div
			className={cx(
				'flex flex-row items-center gap-[6px] leading-[18px] flex-wrap min-w-0 flex-1',
				className,
			)}
		>
			{event.parts.map((part, index) => (
				<TxDescription.Part
					key={`${part.type}${index}`}
					part={part}
					seenAs={seenAs}
				/>
			))}
			{suffix}
		</div>
	)
}

export namespace TxDescription {
	export interface Props {
		event: KnownEvent
		seenAs?: AddressType.Address
		className?: string | undefined
		suffix?: React.ReactNode
	}

	export function Part(props: Part.Props) {
		const { part, seenAs } = props
		switch (part.type) {
			case 'account': {
				const isSelf = seenAs ? isAddressEqual(part.value, seenAs) : false
				return (
					<>
						<a
							href={`${EXPLORER_URL}/address/${part.value}`}
							target="_blank"
							rel="noopener noreferrer"
							className="text-accent press-down whitespace-nowrap font-mono"
						>
							{shortenAddress(part.value)}
						</a>
						{isSelf && <span className="text-tertiary">(self)</span>}
					</>
				)
			}
			case 'action':
				return (
					<span className="inline-flex items-center h-[24px] px-[5px] bg-base-alt text-base-content capitalize">
						{part.value}
					</span>
				)
			case 'amount': {
				const { value, decimals, symbol, token } = part.value
				if (decimals === undefined) return <span>…</span>
				const rawFormatted = Value.format(value, decimals)
				const formatted = PriceFormatter.formatAmount(rawFormatted)
				const isSmall = formatted.startsWith('<')
				return (
					<span className="inline-flex items-center gap-1 min-w-0">
						<span
							className={cx(
								'overflow-hidden text-ellipsis whitespace-nowrap min-w-0',
								isSmall && 'text-tertiary',
							)}
							title={formatted}
						>
							{formatted}
						</span>
						<TokenIcon address={token} className="shrink-0" />
						<a
							href={`${EXPLORER_URL}/token/${token}`}
							target="_blank"
							rel="noopener noreferrer"
							className="text-base-content-positive press-down shrink-0"
						>
							{symbol}
						</a>
					</span>
				)
			}
			case 'duration':
				return <span>{DateFormatter.formatDuration(part.value)}</span>
			case 'hex':
				return (
					<span className="items-end whitespace-nowrap min-w-0 flex-1 font-mono">
						{HexFormatter.shortenHex(part.value)}
					</span>
				)
			case 'number': {
				const formatted = PriceFormatter.formatAmount(
					Array.isArray(part.value)
						? Value.format(...part.value)
						: Value.format(BigInt(part.value)),
				)
				const isSmall = formatted.startsWith('<')
				return (
					<span
						className={cx(
							'items-end overflow-hidden text-ellipsis whitespace-nowrap',
							isSmall && 'text-tertiary',
						)}
						title={formatted}
					>
						{formatted}
					</span>
				)
			}
			case 'role':
				return (
					<span className="items-end whitespace-nowrap" title={part.value}>
						{RoleFormatter.getRoleName(part.value) ||
							HexFormatter.shortenHex(part.value)}
					</span>
				)
			case 'text':
				return <span className="text-tertiary">{part.value}</span>
			case 'tick':
				return <span className="items-end">{part.value}</span>
			case 'token': {
				const { address, symbol } = part.value
				return (
					<a
						href={`${EXPLORER_URL}/token/${address}`}
						target="_blank"
						rel="noopener noreferrer"
						className={cx(
							'press-down whitespace-nowrap inline-flex items-center gap-1',
							!symbol && 'min-w-0 flex-1',
						)}
					>
						<TokenIcon address={address} />
						<span className="text-base-content-positive items-end">
							{symbol || shortenAddress(address)}
						</span>
					</a>
				)
			}
			default:
				return null
		}
	}

	export namespace Part {
		export interface Props {
			part: KnownEventPart
			seenAs?: AddressType.Address
		}
	}

	export function ExpandGroup(props: ExpandGroup.Props) {
		const {
			events,
			seenAs,
			transformEvent,
			emptyContent = '…',
			limit = 1,
			limitFilter,
		} = props
		const [expanded, setExpanded] = React.useState(false)

		if (!events || events.length === 0)
			return (
				<div className="text-tertiary flex items-center">
					<span className="inline-block">{emptyContent}</span>
				</div>
			)

		let eventsToShow = events
		if (!expanded) {
			let filtered = limitFilter ? events.filter(limitFilter) : events
			if (filtered.length === 0) filtered = events
			eventsToShow = filtered.slice(0, limit)
		}
		const remainingCount = events.length - eventsToShow.length
		const displayEvents = transformEvent
			? eventsToShow.map(transformEvent)
			: eventsToShow

		return (
			<div className="flex flex-col gap-[4px] flex-1">
				{displayEvents.map((event, index) => {
					const isLast = index === displayEvents.length - 1
					const showMore = isLast && remainingCount > 0
					return (
						<TxDescription
							key={`${event.type}-${index}`}
							event={event}
							seenAs={seenAs}
							className="flex flex-row items-center gap-[6px]"
							suffix={
								showMore && (
									<button
										type="button"
										onClick={() => setExpanded(true)}
										className="text-tertiary cursor-pointer press-down shrink-0"
									>
										and {remainingCount} more
									</button>
								)
							}
						/>
					)
				})}
			</div>
		)
	}

	export namespace ExpandGroup {
		export interface Props {
			events: KnownEvent[]
			seenAs?: AddressType.Address
			transformEvent?: (event: KnownEvent) => KnownEvent
			emptyContent?: React.ReactNode
			limit?: number
			limitFilter?: (event: KnownEvent) => boolean
		}
	}
}

export function getPerspectiveEvent(
	event: KnownEvent,
	viewer: AddressType.Address,
): KnownEvent {
	if (event.type !== 'send') return event
	if (!event.meta?.to) return event
	if (!isAddressEqual(event.meta.to, viewer)) return event

	const newParts = event.parts.map((part) => {
		if (part.type === 'action' && part.value === 'Send') {
			return { ...part, value: 'Received' }
		}
		if (part.type === 'text' && part.value === 'to') {
			return { ...part, value: 'from' }
		}
		if (part.type === 'account' && event.meta?.from) {
			return { ...part, value: event.meta.from }
		}
		return part
	})

	return { ...event, type: 'received', parts: newParts }
}
