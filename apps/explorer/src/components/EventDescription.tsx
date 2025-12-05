import { Link } from '@tanstack/react-router'
import { type Address as AddressType, Value } from 'ox'
import * as React from 'react'
import { isAddressEqual } from 'viem'
import { cx } from '#cva.config.ts'
import { DateFormatter, HexFormatter, PriceFormatter } from '#lib/formatting.ts'
import type { KnownEvent, KnownEventPart } from '#lib/known-events.ts'
import { Address } from './Address.tsx'
import { Amount } from './Receipt/Amount.tsx'

export function EventDescription(props: EventDescription.Props) {
	const { event, seenAs, className } = props
	return (
		<div
			className={cx(
				'flex flex-row items-center gap-[6px] leading-[18px] flex-wrap',
				className,
			)}
		>
			{event.parts.map((part, index) => (
				<EventDescription.Part
					key={`${part.type}${index}`}
					part={part}
					seenAs={seenAs}
				/>
			))}
		</div>
	)
}

export namespace EventDescription {
	export interface Props {
		event: KnownEvent
		seenAs?: AddressType.Address
		className?: string | undefined
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
					<span className="items-end whitespace-nowrap" title={part.value}>
						{HexFormatter.shortenHex(part.value)}
					</span>
				)
			case 'number':
				return (
					<span className="items-end">
						{PriceFormatter.formatAmount(
							Array.isArray(part.value)
								? Value.format(...part.value)
								: Value.format(BigInt(part.value)),
						)}
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
						className="press-down"
					>
						<span className="text-base-content-positive items-end">
							{part.value.symbol || HexFormatter.shortenHex(part.value.address)}
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
		} = props
		const [expanded, setExpanded] = React.useState(false)

		if (!events || events.length === 0) {
			return (
				<div className="text-tertiary flex items-center">
					<span className="inline-block">{emptyContent}</span>
				</div>
			)
		}

		const eventsToShow = expanded ? events : events.slice(0, limit)
		const remainingCount = events.length - eventsToShow.length
		const displayEvents = transformEvent
			? eventsToShow.map(transformEvent)
			: eventsToShow

		return (
			<div className="flex flex-col gap-[4px]">
				{displayEvents.map((event, index) => (
					<div key={`${event.type}-${index}`} className="flex items-center">
						<EventDescription
							event={event}
							seenAs={seenAs}
							className="flex flex-row items-center gap-[6px] leading-[18px]"
						/>
						{index === eventsToShow.length - 1 && remainingCount > 0 && (
							<button
								type="button"
								onClick={() => setExpanded(true)}
								className="ml-1 text-base-content-secondary cursor-pointer press-down shrink-0"
							>
								and {remainingCount} more
							</button>
						)}
					</div>
				))}
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
		}
	}
}
