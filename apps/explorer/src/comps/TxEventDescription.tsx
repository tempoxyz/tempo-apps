import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { style, variants } from '@tempoxyz/ds/platform'
import * as OxAddress from 'ox/Address'
import type { Address as AddressType } from 'ox'
import * as Hex from 'ox/Hex'
import * as Value from 'ox/Value'
import * as React from 'react'
import { decodeFunctionData, isAddressEqual } from 'viem'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { Amount } from '#comps/Amount'
import { Midcut } from '#comps/Midcut'
import { TokenIcon } from '#comps/TokenIcon'
import { extractContractAbi, getContractAbi } from '#lib/domain/contracts.ts'
import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events.ts'
import {
	DateFormatter,
	HexFormatter,
	PriceFormatter,
	RoleFormatter,
} from '#lib/formatting.ts'
import { useLookupSignature } from '#lib/queries'
import { link, pressDown, truncate } from '#styles/explorer'

export function TxEventMemoLine(
	props: TxEventMemoLine.Props,
): React.JSX.Element {
	const { memo, className } = props
	return (
		<div {...styles.memo({ className })}>
			<span {...styles.memoLabel()}>Memo:</span>
			<span {...cx(styles.memoText(), truncate())} title={memo}>
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
		return <span {...cx(styles.functionName(), link())}>{fnName}</span>
	}

	return (
		<>
			<span {...cx(styles.functionName(), link())}>{fnName}</span>
			<span {...styles.secondary()}>on</span>
			<span {...styles.addressSlot()}>
				<Address
					address={address}
					chars={4}
					search={{ tab: 'contract' }}
					title={address}
					className={styles.contractAddress().className}
				/>
			</span>
		</>
	)
}

export function TxEventDescription(props: TxEventDescription.Props) {
	const { event, seenAs, className, suffix } = props
	return (
		<div {...styles.root({ className })}>
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
					return <span {...styles.tertiary()}>{String(part.value)}</span>
				return (
					<span {...styles.addressSlot()}>
						<Address
							address={part.value}
							chars={4}
							className={styles.accountAddress().className}
							self={seenAs ? isAddressEqual(part.value, seenAs) : false}
						/>
					</span>
				)
			}
			case 'action': {
				const isFailed = part.value === 'Failed'
				const isBlocked = part.value === 'Blocked'
				const isPrivateZoneAction =
					part.value === 'Private Zone Deposit' ||
					part.value === 'Private Zone Withdrawal'
				const tone = isPrivateZoneAction
					? 'zone'
					: isBlocked
						? 'blocked'
						: isFailed
							? 'failed'
							: 'neutral'
				return <span {...styles.action({ tone })}>{part.value}</span>
			}
			case 'amount':
				return <Amount {...part.value} />
			case 'duration':
				return <span>{DateFormatter.formatDuration(part.value)}</span>
			case 'hex':
				return (
					<span {...styles.hex()}>
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
					<span {...cx(styles.end(), truncate())} title={formatted}>
						{formatted}
					</span>
				)
			}
			case 'role':
				return (
					<span {...styles.role()} title={part.value}>
						{RoleFormatter.getRoleName(part.value) || (
							<span {...styles.mono()}>
								{HexFormatter.shortenHex(part.value)}
							</span>
						)}
					</span>
				)
			case 'text':
				return <span {...styles.tertiary()}>{part.value}</span>
			case 'tick':
				return <span {...styles.end()}>{part.value}</span>
			case 'token':
				return (
					<Link
						to="/token/$address"
						params={{ address: part.value.address }}
						title={part.value.address}
						{...cx(
							styles.token(),
							pressDown(),
							!part.value.symbol && styles.tokenFill(),
						)}
					>
						<TokenIcon address={part.value.address} name={part.value.symbol} />
						<span {...styles.tokenSymbol()}>
							{part.value.symbol || (
								<Midcut value={part.value.address} prefix="0x" />
							)}
						</span>
					</Link>
				)
			case 'contractCall':
				return <ContractCallPart {...part.value} seenAs={seenAs} />
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
				<div {...styles.empty()}>
					<span {...styles.emptyContent()}>{emptyContent}</span>
				</div>
			)

		const eventsToShow = expanded ? events : events.slice(0, limit)
		const remainingCount = events.length - eventsToShow.length
		const displayEvents = transformEvent
			? eventsToShow.map(transformEvent)
			: eventsToShow

		return (
			<div {...styles.group()}>
				{displayEvents.map((event, index) => (
					<React.Fragment key={`${event.type}-${index}`}>
						<TxEventDescription event={event} seenAs={seenAs} />
						{renderDetails?.(event)}
					</React.Fragment>
				))}
				{remainingCount > 0 && (
					<button
						type="button"
						onClick={() => setExpanded(true)}
						{...cx(styles.groupToggle(), link(), pressDown())}
					>
						+ Show {remainingCount} more
					</button>
				)}
				{expanded && events.length > limit && (
					<button
						type="button"
						onClick={() => setExpanded(false)}
						{...cx(styles.groupToggle(), link(), pressDown())}
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

namespace styles {
	export const memo = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
		typography: 'body.b3',
	})

	export const memoLabel = style({
		color: 'content.tertiary',
		flexShrink: '0 !custom',
	})

	export const memoText = style({ minWidth: '0 !custom' })

	export const functionName = style({
		alignItems: 'flex-end',
		whiteSpace: 'nowrap',
	})

	export const secondary = style({ color: 'content.secondary' })

	export const tertiary = style({ color: 'content.tertiary' })

	export const addressSlot = style({
		flex: 1,
		flexBasis: '11ch !custom',
		maxWidth: '100% !custom',
		minWidth: '11ch !custom',
		overflow: 'hidden',
	})

	export const contractAddress = style({
		maxWidth: '100% !custom',
		whiteSpace: 'nowrap',
		width: '100% !custom',
	})

	// Address already applies the link color and press-down treatment, so
	// this only adds the properties it leaves unset.
	export const accountAddress = style({
		alignItems: 'flex-end',
		maxWidth: '100% !custom',
		whiteSpace: 'nowrap',
		width: '100% !custom',
	})

	export const root = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const action = variants({
		base: {
			alignItems: 'center',
			borderRadius: '3xs',
			display: 'inline-flex',
			height: '24px !custom',
			paddingInline: '8',
			textTransform: 'capitalize',
		},
		defaultVariants: { tone: 'neutral' },
		variants: {
			tone: {
				blocked: {
					backgroundColor: 'container.warning',
					color: 'content.warning',
				},
				failed: {
					backgroundColor: 'container.negative',
					color: 'content.primary',
				},
				neutral: {
					backgroundColor: 'container.regular',
					color: 'content.primary',
				},
				zone: {
					backgroundColor: 'component.button.primary.fill',
					color: 'background.secondary',
				},
			},
		},
	})

	export const hex = style({
		alignItems: 'flex-end',
		flex: 1,
		minWidth: '0 !custom',
		whiteSpace: 'nowrap',
	})

	export const end = style({ alignItems: 'flex-end' })

	export const role = style({ alignItems: 'flex-end', whiteSpace: 'nowrap' })

	export const mono = style({ fontFamily: '"JetBrains Mono", monospace' })

	export const token = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
		whiteSpace: 'nowrap',
	})

	export const tokenFill = style({ flex: 1, minWidth: '0 !custom' })

	export const tokenSymbol = style({
		alignItems: 'flex-end',
		color: 'content.positive',
	})

	export const empty = style({
		alignItems: 'center',
		color: 'content.tertiary',
		display: 'flex',
	})

	export const emptyContent = style({ display: 'inline-block' })

	export const group = style({
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		gap: '4',
	})

	export const groupToggle = style({
		alignSelf: 'flex-start',
		cursor: 'pointer',
		typography: 'body.b3',
	})
}
