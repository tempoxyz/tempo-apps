import { ClientOnly, Link } from '@tanstack/react-router'
import {
	Amount,
	Button,
	CopyButton,
	formatHex,
	Hex,
	Menu,
	Rows,
	style,
	Surface,
	Tag,
	Tooltip,
} from '@tempoxyz/ds'
import { ChevronDown, Share } from '@tempoxyz/ds/icons'
import type { Address as OxAddress, Hex as OxHex } from 'ox'
import * as Value from 'ox/Value'
import * as React from 'react'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { TempoWordmark } from '#comps/TempoWordmark'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { TxEventDescription, TxEventMemoLine } from '#comps/TxEventDescription'
import type { KnownEvent } from '#lib/domain/known-events'
import {
	getReceiptEventSideAmount,
	isReceiptEventVisible,
} from '#lib/domain/receipt-presentation'
import {
	getReceiptDistinctSideAmount,
	getReceiptEventNote,
	getReceiptNotePresentation,
	getReceiptTransferPresentation,
	type ReceiptNotePresentation,
} from '#lib/domain/receipt-ui'
import { getFeeTokenForChain } from '#lib/fee-token'
import { DateFormatter } from '#lib/formatting'
import {
	areUsdPricedTokens,
	hasTokenAmount,
	isUsdPricedToken,
} from '#lib/pricing'
import { link, linkHover } from '#styles/explorer'
import { getTempoChain } from '#wagmi.config.ts'

const TEMPO_CHAIN_ID = getTempoChain().id
const TEMPO_FEE_TOKEN = getFeeTokenForChain(TEMPO_CHAIN_ID)

/** Actions that move tokens to a recipient, summarized as "Sent to …". */
const SENT_ACTIONS = new Set([
	'Forwarded',
	'MPP Payment',
	'Send',
	'Sent',
	'Transfer',
])

/** Status tags that lead some descriptions; they are not the event's name. */
const STATUS_ACTIONS = new Set(['Blocked', 'Failed'])

/**
 * A printable record of a transaction on the TDS Payments receipt: a
 * `Surface` titled Receipt with its status `Tag`, the amount as the hero
 * with one line on what happened, then `Rows` with the parties or line
 * items, the network fee, the total, the date, the block and the hash.
 */
export function Receipt(props: Receipt.Props): React.JSX.Element {
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
		exportSearch = '',
	} = props
	const { isTokenListed } = useTokenListMembership()
	const titleId = React.useId()

	const hasFee = feeDisplay !== undefined || (fee !== undefined && fee !== null)
	const hasTotal =
		totalDisplay !== undefined || (total !== undefined && total !== null)
	const visibleFeeBreakdown = feeBreakdown.filter(
		(item) => !item.payer || item.payer.toLowerCase() === sender.toLowerCase(),
	)
	const showSingleFee = feeBreakdown.length === 0 && hasFee
	const usdFee = TEMPO_FEE_TOKEN
		? isTokenListed(TEMPO_CHAIN_ID, TEMPO_FEE_TOKEN)
		: true
	const filteredEvents = events
		.filter(isReceiptEventVisible)
		.map(getReceiptTransferPresentation)
	const context = { blockNumber, hash, timestamp }

	// An event's amounts read in USD when every token they use is USD-priced.
	const isUsd = (event: KnownEvent) => {
		const tokens = event.totalAmount
			? [event.totalAmount]
			: event.parts.flatMap((part) =>
					part.type === 'amount' ? [part.value] : [],
				)
		return tokens.length > 0
			? areUsdPricedTokens(TEMPO_CHAIN_ID, tokens, isTokenListed)
			: usdFee
	}

	const single = filteredEvents.length === 1 ? filteredEvents[0] : undefined
	// Only a payment or a swap moves the amount it names; an approval does not.
	const singleAmount =
		single && movesFunds(single) ? getReceiptEventSideAmount(single) : undefined
	// A plain send folds into the From and To rows only when the hero can show
	// its amount; with unknown decimals it stays a line item, which reads them.
	const send =
		single && singleAmount?.decimals !== undefined
			? getSimpleSend(single)
			: null
	const sendNote =
		single && send ? getReceiptEventNote(single.note, context) : undefined
	const firstFee = visibleFeeBreakdown[0]

	// The hero is the amount a single payment moved, else the total, else the fee.
	const hero =
		single && singleAmount?.decimals !== undefined ? (
			<Receipt.TokenAmount
				amount={singleAmount}
				size="lg"
				usd={isUsd(single)}
			/>
		) : total !== undefined ? (
			<Amount currency="USD" size="lg" value={total} />
		) : usdFee && fee !== undefined ? (
			<Amount currency="USD" precise size="lg" value={fee} />
		) : firstFee ? (
			<Amount
				size="lg"
				symbol={firstFee.symbol}
				value={Value.format(firstFee.amount, firstFee.decimals)}
			/>
		) : null

	return (
		<Surface
			data-receipt
			render={<section aria-labelledby={titleId} />}
			{...styles.card()}
		>
			<TempoWordmark
				aria-label="Tempo"
				height={16}
				width={73}
				{...styles.brand()}
			/>
			<Surface.Header>
				<Surface.Title id={titleId}>Receipt</Surface.Title>
				<Tag intent={status === 'reverted' ? 'negative' : 'positive'}>
					<Tag.Dot />
					{status === 'reverted' ? 'Failed' : 'Confirmed'}
				</Tag>
			</Surface.Header>
			<div {...styles.hero()}>
				{hero}
				{summarize(filteredEvents) && (
					<p {...styles.summary()}>{summarize(filteredEvents)}</p>
				)}
			</div>
			{/* Surface pads 24px, so the rows reach its edges and keep their own inset. */}
			<div {...styles.rows()}>
				<Rows.Root dividers="full">
					<Rows.Row>
						<Rows.Label>From</Rows.Label>
						<span {...styles.hex()}>
							<Address address={sender} align="end" />
						</span>
					</Rows.Row>
					{send ? (
						<>
							<Rows.Row>
								<Rows.Label>To</Rows.Label>
								<span {...styles.hex()}>
									<Address address={send.to} align="end" />
								</span>
							</Rows.Row>
							{sendNote && (
								<Rows.Row>
									<Rows.Label>
										{typeof sendNote === 'string' ? 'Memo' : 'Details'}
									</Rows.Label>
									<span {...styles.value()}>
										{typeof sendNote === 'string' ? (
											sendNote
										) : (
											<Receipt.Note note={sendNote} />
										)}
									</span>
								</Rows.Row>
							)}
						</>
					) : (
						filteredEvents.map((event, index) => (
							<Receipt.LineItem
								context={context}
								event={event}
								key={`${event.type}-${index}`}
								usd={isUsd(event)}
							/>
						))
					)}
					{visibleFeeBreakdown.map((item, index) => {
						const usd = hasTokenAmount(item)
							? isUsdPricedToken(TEMPO_CHAIN_ID, item, isTokenListed)
							: usdFee
						const value = Value.format(item.amount, item.decimals)
						return (
							<Rows.Row key={`${item.token ?? item.symbol ?? 'fee'}-${index}`}>
								<Rows.Label>
									Network fee
									{item.symbol && (
										<>
											{' ('}
											{item.token ? (
												<Link
													to="/token/$address"
													params={{ address: item.token }}
													{...cx(link(), linkHover())}
												>
													{item.symbol}
												</Link>
											) : (
												item.symbol
											)}
											{')'}
										</>
									)}
								</Rows.Label>
								{usd ? (
									<Amount currency="USD" precise value={value} />
								) : (
									<Amount symbol={item.symbol} value={value} />
								)}
							</Rows.Row>
						)
					})}
					{showSingleFee && (
						<Rows.Row>
							<Rows.Label>Network fee</Rows.Label>
							{usdFee && fee !== undefined ? (
								<Amount currency="USD" precise value={fee} />
							) : (
								<span {...styles.number()}>{feeDisplay ?? fee}</span>
							)}
						</Rows.Row>
					)}
					{hasTotal && (
						<Rows.Row>
							<Rows.Label>Total</Rows.Label>
							{total !== undefined ? (
								<Amount currency="USD" value={total} />
							) : (
								<span {...styles.number()}>{totalDisplay}</span>
							)}
						</Rows.Row>
					)}
					<ClientOnly fallback={<Receipt.DateRow timestamp={timestamp} utc />}>
						<Receipt.DateRow timestamp={timestamp} />
					</ClientOnly>
					<Rows.Row>
						<Rows.Label>Block</Rows.Label>
						<Link
							to="/block/$id"
							params={{ id: blockNumber.toString() }}
							{...cx(styles.number(), link(), linkHover())}
						>
							{blockNumber.toLocaleString('en-US')}
						</Link>
					</Rows.Row>
					<Rows.Row>
						<Rows.Label>Transaction</Rows.Label>
						{/* The link sits inside `Hex.Root` so it takes the link color. */}
						<Hex.Root value={hash} {...styles.hex()}>
							<Link
								to="/tx/$hash"
								params={{ hash }}
								{...cx(styles.hexLink(), link(), linkHover())}
							>
								<Hex.Text />
							</Link>
							<span {...styles.screenOnly()}>
								<Hex.Copy aria-label="Copy transaction hash" />
							</span>
						</Hex.Root>
					</Rows.Row>
				</Rows.Root>
			</div>
			<Receipt.Actions hash={hash} exportSearch={exportSearch} />
		</Surface>
	)
}

/** The recipient of an event: its `meta.to`, or the account after "to". */
function getRecipient(event: KnownEvent): OxAddress.Address | undefined {
	if (event.meta?.to) return event.meta.to
	const index = event.parts.findIndex(
		(part) => part.type === 'text' && part.value === 'to',
	)
	const next = index === -1 ? undefined : event.parts[index + 1]
	return next?.type === 'account' ? next.value : undefined
}

/** A payment, a receipt of funds, or a swap. */
function movesFunds(event: KnownEvent): boolean {
	const action = event.parts.find((part) => part.type === 'action')?.value
	return (
		(action !== undefined &&
			(SENT_ACTIONS.has(action) || action === 'Received')) ||
		event.type.includes('swap')
	)
}

/** A plain "send an amount to an account" event, whose rows are From and To. */
function getSimpleSend(event: KnownEvent): { to: OxAddress.Address } | null {
	const [action, amount, text, account] = event.parts
	if (
		event.parts.length !== 4 ||
		action?.type !== 'action' ||
		!SENT_ACTIONS.has(action.value) ||
		amount?.type !== 'amount' ||
		text?.type !== 'text' ||
		text.value !== 'to' ||
		account?.type !== 'account'
	)
		return null
	return { to: account.value }
}

/** One line on what happened, such as "Sent to 0xd92d…16d0" or "3 actions". */
function summarize(events: KnownEvent[]): string | undefined {
	if (events.length > 1) return `${events.length} actions`
	const [event] = events
	if (!event) return undefined
	const action = event.parts.find((part) => part.type === 'action')?.value
	const recipient = getRecipient(event)
	if (action && SENT_ACTIONS.has(action) && recipient)
		return `Sent to ${formatHex(recipient)}`
	if (action === 'Received' && event.meta?.from)
		return `Received from ${formatHex(event.meta.from)}`
	const call = event.parts.find((part) => part.type === 'contractCall')
	if (call?.type === 'contractCall')
		return `Called ${formatHex(call.value.address)}`
	return action ? sentenceCase(action) : undefined
}

function sentenceCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1)
}

export namespace Receipt {
	export interface Props {
		blockNumber: bigint
		sender: OxAddress.Address
		hash: OxHex.Hex
		timestamp: bigint
		status?: 'success' | 'reverted'
		events?: KnownEvent[]
		/** Network fee in USD. */
		fee?: number
		/** Shown in place of `fee` when the fee token is not USD-priced. */
		feeDisplay?: string
		/** Total in USD. */
		total?: number
		/** Shown when `total` is unset. */
		totalDisplay?: string
		feeBreakdown?: FeeBreakdownItem[]
		exportSearch?: string | undefined
	}

	export interface FeeBreakdownItem {
		amount: bigint
		decimals: number
		currency: string
		symbol?: string
		token?: OxAddress.Address
		payer?: OxAddress.Address
		display?: string
	}

	/**
	 * One action of the transaction: its name as the label, and the rest of
	 * its description, aggregate amount and details as the value.
	 */
	export function LineItem(props: LineItem.Props): React.JSX.Element {
		const { context, event, usd } = props
		const [first, ...rest] = event.parts
		const action =
			first?.type === 'action' && !STATUS_ACTIONS.has(first.value)
				? first.value
				: undefined
		const parts = action ? rest : event.parts
		const sideAmount = getReceiptDistinctSideAmount(event)
		const note = getReceiptEventNote(event.note, context)
		return (
			<Rows.Row>
				<Rows.Label>{sentenceCase(action ?? event.type)}</Rows.Label>
				<span {...styles.value()}>
					{parts.length > 0 && (
						<TxEventDescription
							className={styles.description().className}
							event={{ ...event, parts }}
						/>
					)}
					{sideAmount && <Receipt.TokenAmount amount={sideAmount} usd={usd} />}
					{note &&
						(typeof note === 'string' ? (
							<TxEventMemoLine memo={note} />
						) : (
							<Receipt.Note note={note} />
						))}
				</span>
			</Rows.Row>
		)
	}

	export namespace LineItem {
		export interface Props {
			context: { blockNumber: bigint; hash: OxHex.Hex; timestamp: bigint }
			event: KnownEvent
			usd: boolean
		}
	}

	/**
	 * The date with seconds and a time zone: UTC on the server, local in the
	 * browser.
	 */
	export function DateRow(props: DateRow.Props): React.JSX.Element {
		const { timestamp, utc = false } = props
		const date = new Date(Number(timestamp) * 1_000)
		const text = new Intl.DateTimeFormat('en-US', {
			day: 'numeric',
			hour: '2-digit',
			hourCycle: 'h23',
			minute: '2-digit',
			month: 'short',
			second: '2-digit',
			timeZone: utc ? 'UTC' : undefined,
			timeZoneName: 'short',
			year: 'numeric',
		}).format(date)
		return (
			<Rows.Row>
				<Rows.Label>Date</Rows.Label>
				<time dateTime={date.toISOString()} {...styles.number()}>
					{text}
				</time>
			</Rows.Row>
		)
	}

	export namespace DateRow {
		export interface Props {
			timestamp: bigint
			utc?: boolean | undefined
		}
	}

	/**
	 * An event amount in full, in its token's symbol; a token without a known
	 * symbol reads in USD when it is USD-priced.
	 */
	export function TokenAmount(
		props: TokenAmount.Props,
	): React.JSX.Element | null {
		const { amount, size, usd } = props
		// An unknown precision or an unlimited approval has no amount to show.
		if (amount.decimals === undefined || amount.value >= 2n ** 255n) return null
		const value = Value.format(amount.value, amount.decimals)
		return !amount.symbol && usd ? (
			<Amount currency="USD" size={size} value={value} />
		) : (
			<Amount size={size} symbol={amount.symbol} value={value} />
		)
	}

	export namespace TokenAmount {
		export interface Props {
			amount: NonNullable<KnownEvent['totalAmount']>
			size?: 'lg' | undefined
			usd: boolean
		}
	}

	/** An event's labelled details, such as the counterparty of a blocked transfer. */
	export function Note(props: Note.Props): React.JSX.Element {
		const { note } = props
		return (
			<span {...styles.note()}>
				{note.map(([label, part], index) => {
					const key = `${label}${index}`
					if ((label === 'from' || label === 'to') && part.type === 'account')
						return (
							<TxEventDescription
								className={styles.description().className}
								key={key}
								event={{
									type: 'blocked transfer address',
									parts: [{ type: 'text', value: label }, part],
								}}
							/>
						)

					const detail = getReceiptNotePresentation(label, part)
					const empty = part.type === 'text' && part.value === ''
					return (
						<span key={key} {...styles.noteItem()}>
							<span {...styles.noteLabel()}>
								{detail.kind === 'time' ? (
									<ClientOnly fallback="Time (UTC)">{detail.label}</ClientOnly>
								) : (
									detail.label
								)}
								{!empty && ':'}
							</span>
							{!empty && <Receipt.NoteValue note={detail} />}
						</span>
					)
				})}
			</span>
		)
	}

	export namespace Note {
		export interface Props {
			note: Exclude<NonNullable<KnownEvent['note']>, string>
		}
	}

	export function NoteTime(props: NoteTime.Props): React.JSX.Element {
		const { timestamp, iso, utc = false } = props
		if (utc)
			return (
				<time dateTime={iso} title={iso}>
					{DateFormatter.formatUtcTimestamp(timestamp)} UTC
				</time>
			)
		const time = DateFormatter.formatTimestampTime(timestamp)
		return (
			<time dateTime={iso} title={iso}>
				{DateFormatter.formatTimestampDate(timestamp)} · {time.time}{' '}
				{time.timezone}
				{time.offset}
			</time>
		)
	}

	export namespace NoteTime {
		export interface Props {
			iso: string
			timestamp: bigint
			utc?: boolean | undefined
		}
	}

	export function NoteValue(props: NoteValue.Props): React.JSX.Element {
		const { note } = props
		if (note.kind === 'block')
			return (
				<Link
					to="/block/$id"
					params={{ id: note.id }}
					{...cx(styles.number(), link(), linkHover())}
				>
					{BigInt(note.id).toLocaleString('en-US')}
				</Link>
			)
		if (note.kind === 'transaction')
			return (
				<Hex.Root value={note.hash} {...styles.hex()}>
					<Link
						to="/tx/$hash"
						params={{ hash: note.hash }}
						{...cx(styles.hexLink(), link(), linkHover())}
					>
						<Hex.Text />
					</Link>
				</Hex.Root>
			)
		if (note.kind === 'time')
			return (
				<ClientOnly
					fallback={
						<Receipt.NoteTime timestamp={note.timestamp} iso={note.iso} utc />
					}
				>
					<Receipt.NoteTime timestamp={note.timestamp} iso={note.iso} />
				</ClientOnly>
			)
		return <TxEventDescription.Part part={note.part} />
	}

	export namespace NoteValue {
		export interface Props {
			note: ReceiptNotePresentation
		}
	}

	/**
	 * Links to the transaction and the exports, a share button where the
	 * browser has a share sheet, and a copy of the receipt's link. Hidden in
	 * print, so the PDF holds only the record.
	 */
	export function Actions(props: Actions.Props): React.JSX.Element {
		const { hash, exportSearch = '' } = props
		const path = `/receipt/${hash}${exportSearch}`
		// The origin and the share sheet exist only in the browser.
		const [origin, setOrigin] = React.useState('')
		const [canShare, setCanShare] = React.useState(false)
		React.useEffect(() => {
			setOrigin(window.location.origin)
			setCanShare(typeof navigator.share === 'function')
		}, [])
		const url = `${origin}${path}`

		return (
			<div {...styles.actions()}>
				<Button.Link
					render={<Link to="/tx/$hash" params={{ hash }} />}
					size="small"
					variant="secondary"
				>
					View transaction
				</Button.Link>
				<Menu.Root>
					<Menu.Trigger render={<Button size="small" variant="secondary" />}>
						Export
						<ChevronDown aria-hidden="true" />
					</Menu.Trigger>
					<Menu.Popup>
						{(['pdf', 'txt', 'json'] as const).map((format) => (
							<Menu.LinkItem
								closeOnClick
								href={`/receipt/${hash}.${format}${exportSearch}`}
								key={format}
							>
								{formats[format]}
							</Menu.LinkItem>
						))}
					</Menu.Popup>
				</Menu.Root>
				<span {...styles.trailing()}>
					{canShare && (
						<Tooltip.Root>
							<Tooltip.Trigger
								render={
									<Button
										aria-label="Share receipt"
										onClick={() =>
											navigator
												.share({ title: 'Tempo receipt', url })
												.catch(() => undefined)
										}
										shape="icon"
										size="small"
										variant="text"
									/>
								}
							>
								<Share />
							</Tooltip.Trigger>
							<Tooltip.Popup>Share receipt</Tooltip.Popup>
						</Tooltip.Root>
					)}
					<CopyButton aria-label="Copy receipt link" value={url} />
				</span>
			</div>
		)
	}

	export namespace Actions {
		export interface Props {
			hash: OxHex.Hex
			exportSearch?: string | undefined
		}
	}
}

const formats = { json: 'JSON', pdf: 'PDF', txt: 'Plain text' } as const

namespace styles {
	export const card = style({
		boxSizing: 'border-box',
		marginInline: 'auto !custom',
		maxWidth: '448',
		width: '100% !custom',
	})

	// The wordmark paints with `currentColor` and sits above the title.
	export const brand = style({
		color: 'foreground',
		display: 'block',
		marginBlockEnd: '20',
	})

	export const hero = style({
		display: 'flex',
		flexDirection: 'column',
		rowGap: '4',
	})

	export const summary = style({
		color: 'gray.900',
		margin: '0',
		typography: 'copy.14',
	})

	export const rows = style({
		marginBlockStart: '16',
		marginInline: '-24px !custom',
	})

	export const number = style({ fontVariantNumeric: 'tabular-nums !custom' })

	// Rows: cap a Hex so it ends with the other values instead of reaching
	// back to its label.
	export const hex = style({
		display: 'flex',
		justifyContent: 'flex-end',
		maxWidth: '256',
		minWidth: '0 !custom',
	})

	// Copy buttons have no use on paper.
	export const screenOnly = style({
		display: 'contents',
		'@media print': { display: 'none' },
	})

	export const hexLink = style({
		display: 'inline-flex',
		maxWidth: '100% !custom',
		minWidth: '0 !custom',
	})

	// A line item's value: its description, amount and details, end-aligned.
	export const value = style({
		alignItems: 'flex-end',
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		maxWidth: '288',
		minWidth: '0',
		textAlign: 'end',
		typography: 'copy.14',
	})

	export const description = style({ justifyContent: 'flex-end' })

	export const note = style({
		alignItems: 'flex-end',
		color: 'gray.900',
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0 !custom',
		typography: 'copy.13',
	})

	export const noteItem = style({
		display: 'flex',
		gap: '8',
		justifyContent: 'flex-end',
		minWidth: '0 !custom',
	})

	export const noteLabel = style({ flexShrink: '0 !custom' })

	export const actions = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		marginBlockStart: '16',
		'@media print': { display: 'none' },
	})

	export const trailing = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
		marginInlineStart: 'auto !custom',
	})
}
