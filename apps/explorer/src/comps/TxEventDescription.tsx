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
import {
	dexPairLabel,
	type KnownEvent,
	type KnownEventPart,
} from '#lib/domain/known-events.ts'
import {
	DateFormatter,
	HexFormatter,
	PriceFormatter,
	RoleFormatter,
} from '#lib/formatting.ts'
import { useLookupSignature } from '#lib/queries'
import ArrowLeftRightIcon from '~icons/lucide/arrow-left-right'
import { toPastTenseEvent } from '#lib/domain/action-label'

const PRIVATE_ZONE_ACTIONS = new Set([
	'Private Zone Deposit',
	'Private Zone Withdrawal',
	'Deposited to Private Zone',
	'Withdrew from Private Zone',
])

export function TxEventMemoLine(
	props: TxEventMemoLine.Props,
): React.JSX.Element {
	const { memo, className } = props
	return (
		<div
			className={cx(
				'flex min-w-0 items-center gap-2 copy-13 text-secondary',
				className,
			)}
		>
			<span className="text-tertiary shrink-0">Memo:</span>
			<span
				className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
				title={memo}
			>
				{memo}
			</span>
		</div>
	)
}

export declare namespace TxEventMemoLine {
	type Props = {
		memo: string
		className?: string | undefined
	}
}

/**
 * Renders a contract call with decoded function name.
 * Fetches ABI from registry or extracts from bytecode using whatsabi.
 * Falls back to 4byte directory lookup.
 */
function ContractCallPart(props: {
	address: AddressType.Address
	input: Hex.Hex
	seenAs?: AddressType.Address
}) {
	const { address, input, seenAs } = props
	const selector = Hex.slice(input, 0, 4)
	const isViewingAsContract = seenAs && isAddressEqual(seenAs, address)

	const { data: abi, isLoading: isLoadingAbi } = useQuery({
		queryKey: ['contract-call-abi', address.toLowerCase()],
		queryFn: async () => {
			// Try known ABI first
			const knownAbi = getContractAbi(address)
			if (knownAbi) return knownAbi

			// Fall back to extracting from bytecode
			return extractContractAbi(address)
		},
		staleTime: Number.POSITIVE_INFINITY,
	})
	const functionName = React.useMemo(() => {
		if (!abi) return null
		try {
			return decodeFunctionData({ abi, data: input }).functionName
		} catch {
			return null
		}
	}, [abi, input])

	// Fall back to 4byte directory lookup
	const { data: signature, isFetched: isSignatureFetched } = useLookupSignature(
		{
			selector,
			enabled: !functionName && !isLoadingAbi,
		},
	)

	// Extract function name from signature (e.g., "transfer(address,uint256)" -> "transfer")
	const signatureFnName = signature?.split('(')[0]

	const isLoading = isLoadingAbi || (!functionName && !isSignatureFetched)
	const fnName = isLoading
		? selector
		: (functionName ?? signatureFnName ?? selector)

	if (isViewingAsContract) {
		return (
			<span className="text-accent items-end whitespace-nowrap">{fnName}</span>
		)
	}

	return (
		<>
			<span className="text-accent items-end whitespace-nowrap">{fnName}</span>
			<span className="text-secondary">on</span>
			<span className="min-w-[11ch] basis-[11ch] max-w-full flex-1 overflow-hidden">
				<Address
					address={address}
					chars={4}
					search={{ tab: 'contract' }}
					title={address}
					className="whitespace-nowrap w-full max-w-full"
				/>
			</span>
		</>
	)
}

/** DEX route params are lowercase addresses. */
function lower(address: AddressType.Address): AddressType.Address {
	return address.toLowerCase() as AddressType.Address
}

export function TxEventDescription(props: TxEventDescription.Props) {
	const { seenAs, className, suffix, tense = 'past' } = props
	const event = tense === 'past' ? toPastTenseEvent(props.event) : props.event
	return (
		<div
			className={cx(
				'flex flex-row items-center gap-[6px] flex-wrap min-w-0 flex-1',
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
		/** Simulations haven't happened yet, so they keep the plain verb. */
		tense?: 'past' | 'plain' | undefined
	}

	export function Part(props: Part.Props) {
		const { part, seenAs } = props
		switch (part.type) {
			case 'account': {
				if (!OxAddress.validate(part.value))
					return <span className="text-tertiary">{String(part.value)}</span>
				return (
					<span className="min-w-[11ch] basis-[11ch] max-w-full flex-1 overflow-hidden">
						<Address
							address={part.value}
							chars={4}
							className="text-accent items-end press-down whitespace-nowrap w-full max-w-full"
							self={seenAs ? isAddressEqual(part.value, seenAs) : false}
						/>
					</span>
				)
			}
			case 'action': {
				const isFailed =
					part.value === 'Failed' || part.value.endsWith(' Failed')
				const isBlocked =
					part.value === 'Blocked' || part.value === 'Send Blocked'
				const isPrivateZoneAction = PRIVATE_ZONE_ACTIONS.has(part.value)
				return (
					<span
						className={cx(
							'inline-flex h-[24px] items-center rounded-[2px] px-[6px] capitalize',
							isPrivateZoneAction
								? 'bg-inverse text-content-inverse'
								: isBlocked
									? 'bg-warning-subtle text-warning'
									: isFailed
										? 'bg-negative/[0.06] text-primary'
										: 'bg-distinct/70 text-primary',
						)}
					>
						{part.value}
					</span>
				)
			}
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
						? Value.format(BigInt(part.value[0]), part.value[1])
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
						{RoleFormatter.getRoleName(part.value) || (
							<span className="font-mono">
								{HexFormatter.shortenHex(part.value)}
							</span>
						)}
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
				return <ContractCallPart {...part.value} seenAs={seenAs} />
			case 'dexRoute':
				return (
					<Link
						to="/dex/$from/$to"
						params={{ from: lower(part.value.from), to: lower(part.value.to) }}
						title="View this route on the Stablecoin DEX"
						className="inline-flex h-[24px] items-center gap-[4px] rounded-[2px] px-[6px] whitespace-nowrap bg-accent/10 text-accent hover:bg-accent/15 press-down"
					>
						<ArrowLeftRightIcon className="size-[12px]" />
						Stablecoin DEX
					</Link>
				)
			case 'dexPair':
				if (!part.value.active)
					return (
						<span
							className="whitespace-nowrap text-primary"
							title="A retired Stablecoin DEX book"
						>
							{dexPairLabel(part.value, ' / ')}
						</span>
					)
				return (
					<Link
						to="/dex/$from/$to"
						params={{
							from: lower(part.value.base.address),
							to: lower(part.value.quote.address),
						}}
						title="View this pair on the Stablecoin DEX"
						className="whitespace-nowrap text-accent hover:underline press-down"
					>
						{dexPairLabel(part.value, ' / ')}
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
			renderDetails,
			emptyContent = '…',
			limit = 3,
		} = props
		const [expanded, setExpanded] = React.useState(false)

		if (!events || events.length === 0)
			return (
				<div className="text-tertiary flex items-center">
					<span className="inline-block">{emptyContent}</span>
				</div>
			)

		const eventsToShow = expanded ? events : events.slice(0, limit)
		const remainingCount = events.length - eventsToShow.length
		const displayEvents = transformEvent
			? eventsToShow.map(transformEvent)
			: eventsToShow

		return (
			<div className="flex flex-col gap-[4px] flex-1">
				{displayEvents.map((event, index) => (
					<React.Fragment key={`${event.type}-${index}`}>
						<TxEventDescription
							event={event}
							seenAs={seenAs}
							className="flex flex-row items-center gap-[6px]"
						/>
						{renderDetails?.(event)}
					</React.Fragment>
				))}
				{remainingCount > 0 && (
					<button
						type="button"
						onClick={() => setExpanded(true)}
						className="label-12 text-accent cursor-pointer press-down self-start"
					>
						+ Show {remainingCount} more
					</button>
				)}
				{expanded && events.length > limit && (
					<button
						type="button"
						onClick={() => setExpanded(false)}
						className="label-12 text-accent cursor-pointer press-down self-start"
					>
						− View less
					</button>
				)}
			</div>
		)
	}

	export namespace ExpandGroup {
		export interface Props {
			events: KnownEvent[]
			seenAs?: AddressType.Address
			transformEvent?: (event: KnownEvent) => KnownEvent
			renderDetails?: (event: KnownEvent) => React.ReactNode
			emptyContent?: React.ReactNode
			limit?: number
		}
	}
}
