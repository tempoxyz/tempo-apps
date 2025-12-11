import { Link } from '@tanstack/react-router'
import { type Address as AddressType, Value } from 'ox'
import * as React from 'react'
import { isAddressEqual } from 'viem'
import { Address } from '#comps/Address'
import { Amount } from '#comps/Amount'
import { Midcut } from '#comps/Midcut'
import { cx } from '#cva.config.ts'
import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events.ts'
import {
	DateFormatter,
	HexFormatter,
	PriceFormatter,
	RoleFormatter,
} from '#lib/formatting.ts'

export function TxEventDescription(props: TxEventDescription.Props) {
	const { event, seenAs, className, suffix } = props
	return (
		<div
			className={cx(
				'flex flex-row items-center gap-[6px] leading-[18px] flex-wrap min-w-0 flex-1',
				className,
			)}
		>
			{event.parts.map((part, index) => (
				<TxEventDescription.Part
					key={`${part.type}${index}`}
					part={part}
					seenAs={seenAs}
				/>
			))}
			{suffix}
		</div>
	)
}

export namespace TxEventDescription {
	export interface Props {
		event: KnownEvent
		seenAs?: AddressType.Address
		className?: string | undefined
		suffix?: React.ReactNode
	}

	export function Part(props: Part.Props) {
		const { part, seenAs } = props
		switch (part.type) {
			case 'account':
				return (
					<Address
						address={part.value}
						className="text-accent items-end press-down whitespace-nowrap"
						self={seenAs ? isAddressEqual(part.value, seenAs) : false}
					/>
				)
			case 'action':
				return (
					<span className="inline-flex items-center h-[24px] px-[5px] bg-base-alt text-base-content capitalize">
						{part.value}
					</span>
				)
			case 'amount':
				return <Amount {...part.value} />
			case 'duration':
				return <span>{DateFormatter.formatDuration(part.value)}</span>
			case 'hex':
				return (
					<span className="items-end whitespace-nowrap min-w-0 flex-1">
						<Midcut value={part.value} prefix="0x" />
					</span>
				)
			case 'number': {
				const formatted = PriceFormatter.formatAmount(
					Array.isArray(part.value)
						? Value.format(...part.value)
						: Value.format(BigInt(part.value)),
				)
				return (
					<span
						className="items-end overflow-hidden text-ellipsis whitespace-nowrap"
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
				return <span>{part.value}</span>
			case 'tick':
				return <span className="items-end">{part.value}</span>
			case 'token':
				return (
					<Link
						to="/token/$address"
						params={{ address: part.value.address }}
						title={part.value.address}
						className={cx(
							'press-down whitespace-nowrap',
							!part.value.symbol && 'min-w-0 flex-1',
						)}
					>
						<span className="text-base-content-positive items-end">
							{part.value.symbol || (
								<Midcut value={part.value.address} prefix="0x" />
							)}
						</span>
					</Link>
				)
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
						<TxEventDescription
							key={`${event.type}-${index}`}
							event={event}
							seenAs={seenAs}
							className="flex flex-row items-center gap-[6px]"
							suffix={
								showMore && (
									<button
										type="button"
										onClick={() => setExpanded(true)}
										className="text-base-content-secondary cursor-pointer press-down shrink-0"
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
