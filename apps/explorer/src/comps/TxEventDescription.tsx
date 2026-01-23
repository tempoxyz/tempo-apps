import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as OxAddress from 'ox/Address'
import type { Address as AddressType } from 'ox'
import * as Hex from 'ox/Hex'
import * as Value from 'ox/Value'
import * as React from 'react'
import { decodeFunctionData, isAddressEqual } from 'viem'
import { Address } from '#comps/Address'
import { Amount } from '#comps/Amount'
import { Midcut } from '#comps/Midcut'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import { extractContractAbi, getContractAbi } from '#lib/domain/contracts.ts'
import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events.ts'
import {
	DateFormatter,
	HexFormatter,
	PriceFormatter,
	RoleFormatter,
} from '#lib/formatting.ts'

/**
 * Renders a contract call with decoded function name.
 * Fetches ABI from registry or extracts from bytecode using whatsabi.
 */
function ContractCallPart(props: {
	address: AddressType.Address
	input: Hex.Hex
}) {
	const { address, input } = props
	const selector = Hex.slice(input, 0, 4)

	const { data: functionName, isLoading } = useQuery({
		queryKey: ['contract-call-function', address, selector],
		queryFn: async () => {
			// Try known ABI first
			let abi = getContractAbi(address)

			// Fall back to extracting from bytecode
			if (!abi) {
				abi = await extractContractAbi(address)
			}

			if (!abi) return null

			try {
				const decoded = decodeFunctionData({ abi, data: input })
				return decoded.functionName
			} catch {
				return null
			}
		},
		staleTime: Number.POSITIVE_INFINITY,
	})

	// Show selector while loading or if we couldn't decode
	const displayText = isLoading ? selector : (functionName ?? selector)

	return (
		<Link
			to="/address/$address"
			params={{ address }}
			search={{ tab: 'contract' }}
			title={`${address} - ${functionName ?? selector}`}
			className="press-down whitespace-nowrap"
		>
			<span className="text-accent items-end">{displayText}</span>
		</Link>
	)
}

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
			case 'account': {
				if (!OxAddress.validate(part.value))
					return <span className="text-tertiary">{String(part.value)}</span>
				return (
					<Address
						address={part.value}
						className="text-accent items-end press-down whitespace-nowrap"
						self={seenAs ? isAddressEqual(part.value, seenAs) : false}
					/>
				)
			}
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
				const isSmall = formatted.startsWith('<')
				return (
					<span
						className={`items-end overflow-hidden text-ellipsis whitespace-nowrap ${isSmall ? 'text-tertiary' : ''}`}
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
			case 'token':
				return (
					<Link
						to="/token/$address"
						params={{ address: part.value.address }}
						title={part.value.address}
						className={cx(
							'press-down whitespace-nowrap inline-flex items-center gap-1',
							!part.value.symbol && 'min-w-0 flex-1',
						)}
					>
						<TokenIcon address={part.value.address} name={part.value.symbol} />
						<span className="text-base-content-positive items-end">
							{part.value.symbol || (
								<Midcut value={part.value.address} prefix="0x" />
							)}
						</span>
					</Link>
				)
			case 'contractCall':
				return <ContractCallPart {...part.value} />
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
