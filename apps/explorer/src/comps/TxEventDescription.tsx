import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button, Hex as HexDisplay, style, Tag, Token } from '@tempoxyz/ds'
import * as OxAddress from 'ox/Address'
import type { Address as AddressType } from 'ox'
import * as Hex from 'ox/Hex'
import * as Value from 'ox/Value'
import * as React from 'react'
import { decodeFunctionData, isAddressEqual } from 'viem'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { Amount } from '#comps/Amount'
import { extractContractAbi, getContractAbi } from '#lib/domain/contracts.ts'
import {
	dexPairLabel,
	type KnownEvent,
	type KnownEventPart,
} from '#lib/domain/known-events.ts'
import {
	DateFormatter,
	PriceFormatter,
	RoleFormatter,
} from '#lib/formatting.ts'
import { useLookupSignature } from '#lib/queries'
import { codeIdentifier, link, linkHover, truncate } from '#styles/explorer'

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
}): React.JSX.Element {
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

	const name = (
		<code {...cx(styles.functionName(), codeIdentifier())}>{fnName}</code>
	)
	if (isViewingAsContract) return name

	return (
		<>
			{name}
			<span {...styles.secondary()}>on</span>
			<span {...styles.addressSlot()}>
				<Address
					address={address}
					search={{ tab: 'contract' }}
					title={address}
				/>
			</span>
		</>
	)
}

/** DEX route params are lowercase addresses. */
function lower(address: AddressType.Address): AddressType.Address {
	return address.toLowerCase() as AddressType.Address
}

/** Action names start with a capital, as sentence case asks. */
function sentenceCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1)
}

export function TxEventDescription(
	props: TxEventDescription.Props,
): React.JSX.Element {
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

	export function Part(props: Part.Props): React.JSX.Element | null {
		const { part, seenAs } = props
		switch (part.type) {
			case 'account': {
				if (!OxAddress.validate(part.value))
					return <span {...styles.secondary()}>{String(part.value)}</span>
				return (
					<span {...styles.addressSlot()}>
						<Address
							address={part.value}
							self={seenAs ? isAddressEqual(part.value, seenAs) : false}
						/>
					</span>
				)
			}
			case 'action': {
				if (part.value === 'Failed' || part.value === 'Blocked')
					return (
						<Tag
							intent={part.value === 'Failed' ? 'negative' : 'warning'}
							variant="plain"
						>
							<Tag.Dot />
							{part.value}
						</Tag>
					)
				if (
					part.value === 'Private Zone Deposit' ||
					part.value === 'Private Zone Withdrawal'
				)
					return <Tag intent="accent">{part.value}</Tag>
				return <Tag>{sentenceCase(part.value)}</Tag>
			}
			case 'amount':
				return <Amount {...part.value} />
			case 'duration':
				return <span>{DateFormatter.formatDuration(part.value)}</span>
			case 'hex':
				return <HexDisplay value={part.value} {...styles.fill()} />
			case 'number': {
				const formatted = PriceFormatter.formatAmount(
					Array.isArray(part.value)
						? Value.format(BigInt(part.value[0]), part.value[1])
						: Value.format(BigInt(part.value)),
				)
				return (
					<span {...truncate()} title={formatted}>
						{formatted}
					</span>
				)
			}
			case 'role': {
				const name = RoleFormatter.getRoleName(part.value)
				if (!name) return <HexDisplay value={part.value} {...styles.fill()} />
				return (
					<span {...styles.role()} title={part.value}>
						{name}
					</span>
				)
			}
			case 'text':
				return <span {...styles.secondary()}>{part.value}</span>
			case 'tick':
				return <span>{part.value}</span>
			case 'token': {
				const { address, symbol } = part.value
				const token = (children: React.ReactNode) => (
					<Link
						to="/token/$address"
						params={{ address }}
						title={address}
						{...cx(styles.token(), link(), linkHover())}
					>
						<Token address={address} size="small" />
						{children}
					</Link>
				)
				if (symbol) return token(symbol)
				// The link sits inside `Hex.Root` so it takes the link color.
				return (
					<HexDisplay.Root value={address} {...styles.fill()}>
						{token(<HexDisplay.Text />)}
					</HexDisplay.Root>
				)
			}
			case 'contractCall':
				return <ContractCallPart {...part.value} seenAs={seenAs} />
			case 'dexRoute':
				return (
					<Link
						to="/dex/$from/$to"
						params={{ from: lower(part.value.from), to: lower(part.value.to) }}
						title="View this route on the Stablecoin DEX"
						{...cx(styles.dexPair(), link(), linkHover())}
					>
						Stablecoin DEX
					</Link>
				)
			case 'dexPair':
				if (!part.value.active)
					return (
						<span
							{...styles.dexPairRetired()}
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
						{...cx(styles.dexPair(), link(), linkHover())}
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

	export function ExpandGroup(props: ExpandGroup.Props): React.JSX.Element {
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
					<Button
						onClick={() => setExpanded(true)}
						size="small"
						variant="text"
						{...styles.groupToggle()}
					>
						Show {remainingCount} more
					</Button>
				)}
				{expanded && events.length > limit && (
					<Button
						onClick={() => setExpanded(false)}
						size="small"
						variant="text"
						{...styles.groupToggle()}
					>
						Show fewer
					</Button>
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
	export const dexPair = style({ whiteSpace: 'nowrap' })

	export const dexPairRetired = style({
		color: 'foreground',
		whiteSpace: 'nowrap',
	})

	export const memo = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
		typography: 'label.12',
	})

	export const memoLabel = style({ flexShrink: '0 !custom' })

	export const memoText = style({ minWidth: '0 !custom' })

	export const functionName = style({
		typography: 'copy.13.mono',
		whiteSpace: 'nowrap',
	})

	export const secondary = style({ color: 'gray.900' })

	// The slot clips, so the link's focus ring is drawn inside it.
	export const addressSlot = style({
		flex: 1,
		flexBasis: '11ch !custom',
		maxWidth: '100% !custom',
		minWidth: '11ch !custom',
		overflow: 'hidden',
		selectors: { '& a:focus-visible': { outlineOffset: '-2' } },
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

	// Hex leaves its flex sizing unset; a long value takes the rest of the line.
	export const fill = style({ flex: '1 !custom', minWidth: '0 !custom' })

	export const role = style({ whiteSpace: 'nowrap' })

	export const token = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
		maxWidth: '100% !custom',
		minWidth: '0 !custom',
		whiteSpace: 'nowrap',
	})

	export const empty = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'flex',
	})

	export const emptyContent = style({ display: 'inline-block' })

	export const group = style({
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		gap: '4',
	})

	export const groupToggle = style({ alignSelf: 'flex-start' })
}
