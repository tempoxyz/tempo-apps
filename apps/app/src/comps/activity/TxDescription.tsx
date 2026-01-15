import { Link } from '@tanstack/react-router'
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
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right'
import ArrowDownLeftIcon from '~icons/lucide/arrow-down-left'
import SparklesIcon from '~icons/lucide/sparkles'
import FlameIcon from '~icons/lucide/flame'
import ShieldCheckIcon from '~icons/lucide/shield-check'
import ShieldOffIcon from '~icons/lucide/shield-off'
import PauseIcon from '~icons/lucide/pause'
import PlayIcon from '~icons/lucide/play'
import CheckCircleIcon from '~icons/lucide/check-circle'
import PlusCircleIcon from '~icons/lucide/plus-circle'
import ShoppingCartIcon from '~icons/lucide/shopping-cart'
import TagIcon from '~icons/lucide/tag'
import CheckIcon from '~icons/lucide/check'
import XIcon from '~icons/lucide/x'
import SettingsIcon from '~icons/lucide/settings'
import CoinsIcon from '~icons/lucide/coins'
import ArrowLeftRightIcon from '~icons/lucide/arrow-left-right'
import RefreshCwIcon from '~icons/lucide/refresh-cw'

const EXPLORER_URL = 'https://explore.mainnet.tempo.xyz'

const ACTION_STYLES: Record<
	string,
	{ icon: React.ReactNode; color: string; bg: string }
> = {
	send: {
		icon: <ArrowUpRightIcon className="size-[12px]" />,
		color: '#3b82f6',
		bg: 'rgba(59, 130, 246, 0.15)',
	},
	received: {
		icon: <ArrowDownLeftIcon className="size-[12px]" />,
		color: '#22c55e',
		bg: 'rgba(34, 197, 94, 0.15)',
	},
	mint: {
		icon: <SparklesIcon className="size-[12px]" />,
		color: '#f97316',
		bg: 'rgba(249, 115, 22, 0.15)',
	},
	burn: {
		icon: <FlameIcon className="size-[12px]" />,
		color: '#ef4444',
		bg: 'rgba(239, 68, 68, 0.15)',
	},
	swap: {
		icon: <ArrowLeftRightIcon className="size-[12px]" />,
		color: '#8b5cf6',
		bg: 'rgba(139, 92, 246, 0.15)',
	},
	approve: {
		icon: <CheckCircleIcon className="size-[12px]" />,
		color: '#06b6d4',
		bg: 'rgba(6, 182, 212, 0.15)',
	},
	'grant role': {
		icon: <ShieldCheckIcon className="size-[12px]" />,
		color: '#22c55e',
		bg: 'rgba(34, 197, 94, 0.15)',
	},
	'revoke role': {
		icon: <ShieldOffIcon className="size-[12px]" />,
		color: '#ef4444',
		bg: 'rgba(239, 68, 68, 0.15)',
	},
	'pause transfers': {
		icon: <PauseIcon className="size-[12px]" />,
		color: '#f59e0b',
		bg: 'rgba(245, 158, 11, 0.15)',
	},
	'resume transfers': {
		icon: <PlayIcon className="size-[12px]" />,
		color: '#22c55e',
		bg: 'rgba(34, 197, 94, 0.15)',
	},
	'create token': {
		icon: <PlusCircleIcon className="size-[12px]" />,
		color: '#8b5cf6',
		bg: 'rgba(139, 92, 246, 0.15)',
	},
	'partial fill': {
		icon: <CheckIcon className="size-[12px]" />,
		color: '#22c55e',
		bg: 'rgba(34, 197, 94, 0.15)',
	},
	'complete fill': {
		icon: <CheckIcon className="size-[12px]" />,
		color: '#22c55e',
		bg: 'rgba(34, 197, 94, 0.15)',
	},
	'cancel order': {
		icon: <XIcon className="size-[12px]" />,
		color: '#ef4444',
		bg: 'rgba(239, 68, 68, 0.15)',
	},
	'set fee token': {
		icon: <SettingsIcon className="size-[12px]" />,
		color: '#6b7280',
		bg: 'rgba(107, 114, 128, 0.15)',
	},
	'pay fee': {
		icon: <CoinsIcon className="size-[12px]" />,
		color: '#f59e0b',
		bg: 'rgba(245, 158, 11, 0.15)',
	},
}

function getActionStyle(action: string): {
	icon: React.ReactNode
	color: string
	bg: string
} {
	const normalized = action.toLowerCase()

	if (ACTION_STYLES[normalized]) return ACTION_STYLES[normalized]

	if (normalized.includes('buy'))
		return {
			icon: <ShoppingCartIcon className="size-[12px]" />,
			color: '#22c55e',
			bg: 'rgba(34, 197, 94, 0.15)',
		}
	if (normalized.includes('sell'))
		return {
			icon: <TagIcon className="size-[12px]" />,
			color: '#ef4444',
			bg: 'rgba(239, 68, 68, 0.15)',
		}
	if (normalized.includes('flip'))
		return {
			icon: <RefreshCwIcon className="size-[12px]" />,
			color: '#8b5cf6',
			bg: 'rgba(139, 92, 246, 0.15)',
		}

	return { icon: null, color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' }
}

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
						<Link
							to="/$address"
							params={{ address: part.value }}
							className="text-accent press-down whitespace-nowrap font-mono"
						>
							{shortenAddress(part.value)}
						</Link>
						{isSelf && <span className="text-tertiary">(self)</span>}
					</>
				)
			}
			case 'action': {
				const { icon, color, bg } = getActionStyle(part.value)
				return (
					<span
						className="inline-flex items-center gap-1 h-[24px] px-[6px] capitalize rounded-[4px]"
						style={{ color, backgroundColor: bg }}
					>
						{icon}
						{part.value}
					</span>
				)
			}
			case 'amount': {
				const { value, decimals, symbol, token } = part.value
				const effectiveDecimals = decimals ?? 6
				const rawFormatted = Value.format(value, effectiveDecimals)
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
						<TokenIcon address={token} className="shrink-0 size-[18px]" />
						<a
							href={`${EXPLORER_URL}/token/${token}`}
							target="_blank"
							rel="noopener noreferrer"
							className="text-base-content-positive press-down shrink-0 font-medium font-mono"
						>
							{symbol || shortenAddress(token)}
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
						<TokenIcon address={address} className="size-[18px]" />
						<span className="text-base-content-positive items-end font-mono">
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

	// Self-send: keep as Send (handled separately via expandSelfSends)
	if (event.meta.from && isAddressEqual(event.meta.from, viewer)) {
		return event
	}

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

export function expandSelfSends(
	events: KnownEvent[],
	viewer: AddressType.Address,
): KnownEvent[] {
	const result: KnownEvent[] = []
	for (const event of events) {
		result.push(event)
		// For self-sends, also add a Received version
		if (
			event.type === 'send' &&
			event.meta?.from &&
			event.meta?.to &&
			isAddressEqual(event.meta.from, viewer) &&
			isAddressEqual(event.meta.to, viewer)
		) {
			const receivedParts = event.parts.map((part) => {
				if (part.type === 'action' && part.value === 'Send') {
					return { ...part, value: 'Received' }
				}
				if (part.type === 'text' && part.value === 'to') {
					return { ...part, value: 'from' }
				}
				return part
			})
			result.push({ ...event, type: 'received', parts: receivedParts })
		}
	}
	return result
}
