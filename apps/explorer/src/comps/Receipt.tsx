import { ClientOnly, Link } from '@tanstack/react-router'
import { style, Tag } from '@tempoxyz/ds'
import { Document, Download, Share } from '@tempoxyz/ds/icons'
import type { Address, Hex } from 'ox'
import * as Value from 'ox/Value'
import { cx } from 'zyzz'
import { Amount } from '#comps/Amount'
import { CopyButton } from '#comps/CopyButton'
import { Midcut } from '#comps/Midcut'
import { TempoWordmark } from '#comps/TempoWordmark'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { TxEventDescription, TxEventMemoLine } from '#comps/TxEventDescription'
import type { KnownEvent } from '#lib/domain/known-events'
import { isReceiptEventVisible } from '#lib/domain/receipt-presentation'
import {
	getReceiptDistinctSideAmount,
	getReceiptEventNote,
	getReceiptNotePresentation,
	getReceiptTransferPresentation,
	type ReceiptNotePresentation,
} from '#lib/domain/receipt-ui'
import { DateFormatter, PriceFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import {
	areUsdPricedTokens,
	hasTokenAmount,
	isUsdPricedToken,
} from '#lib/pricing'
import { getFeeTokenForChain } from '#lib/fee-token'
import {
	link,
	linkHover,
	mono,
	pressDown,
	transitionColors,
} from '#styles/explorer'
import { getTempoChain } from '#wagmi.config.ts'
import BracesIcon from '~icons/lucide/braces'

const TEMPO_CHAIN_ID = getTempoChain().id
const TEMPO_FEE_TOKEN = getFeeTokenForChain(TEMPO_CHAIN_ID)

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
	const copyShare = useCopy({ message: 'Link copied' })
	const { isTokenListed } = useTokenListMembership()

	const hasFee = feeDisplay !== undefined || (fee !== undefined && fee !== null)
	const hasTotal =
		totalDisplay !== undefined || (total !== undefined && total !== null)
	const visibleFeeBreakdown = feeBreakdown.filter(
		(item) => !item.payer || item.payer.toLowerCase() === sender.toLowerCase(),
	)
	const showFeeBreakdown = visibleFeeBreakdown.length > 0
	const showSingleFee = feeBreakdown.length === 0 && hasFee
	const showUsdFeePrefix = TEMPO_FEE_TOKEN
		? isTokenListed(TEMPO_CHAIN_ID, TEMPO_FEE_TOKEN)
		: true
	const filteredEvents = events
		.filter(isReceiptEventVisible)
		.map(getReceiptTransferPresentation)
	const handleShare = async () => {
		const url = new URL(
			`/receipt/${hash}${exportSearch}`,
			window.location.origin,
		).toString()
		if (navigator.share) {
			try {
				await navigator.share({ title: 'Tempo receipt', url })
				return
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') return
			}
		}
		await copyShare.copy(url)
	}

	return (
		<>
			<div data-receipt {...styles.card()}>
				<div {...styles.head()}>
					<div {...styles.mark()}>
						<TempoWordmark
							aria-label="Tempo"
							height={16}
							width={73}
							{...styles.wordmark()}
						/>
					</div>
					<div {...styles.fields()}>
						<div {...styles.field()}>
							<span {...styles.label()}>Block</span>
							<Link
								to="/block/$id"
								params={{ id: blockNumber.toString() }}
								{...cx(styles.blockLink(), link(), linkHover())}
							>
								{String(blockNumber)}
							</Link>
						</div>
						<div {...cx(styles.field(), styles.fieldGap())}>
							<span {...styles.label()}>Sender</span>
							<Link
								to="/address/$address"
								params={{ address: sender }}
								{...cx(
									styles.hashLink(),
									mono(),
									link(),
									linkHover(),
									pressDown(),
								)}
							>
								<Midcut value={sender} prefix="0x" align="end" min={4} />
							</Link>
						</div>
						<div {...cx(styles.field(), styles.fieldGap(), styles.centered())}>
							<span {...styles.label()}>Hash</span>
							<div {...styles.hashValue()}>
								<Link
									to="/tx/$hash"
									params={{ hash }}
									{...cx(
										styles.hashLink(),
										mono(),
										link(),
										linkHover(),
										pressDown(),
									)}
									title={hash}
								>
									<Midcut value={hash} prefix="0x" align="end" min={4} />
								</Link>
								<CopyButton value={hash} ariaLabel="Copy transaction hash" />
							</div>
						</div>
						<ClientOnly
							fallback={<Receipt.TimeRows timestamp={timestamp} utc />}
						>
							<Receipt.TimeRows timestamp={timestamp} />
						</ClientOnly>
						{status === 'reverted' && (
							<div {...cx(styles.field(), styles.centered())}>
								<span {...styles.label()}>Status</span>
								<Tag intent="negative" variant="plain">
									<Tag.Dot />
									Failed
								</Tag>
							</div>
						)}
					</div>
				</div>
				{filteredEvents.length > 0 && (
					<>
						<div {...styles.divider()} />
						<div {...styles.events()}>
							{filteredEvents.map((event, index) => {
								// Only a distinct aggregate needs a second amount beside the description.
								const amountParts = event.parts.filter(
									(part) => part.type === 'amount',
								)
								const displayTotalAmount = event.totalAmount
								const amountTokens = displayTotalAmount
									? [displayTotalAmount]
									: amountParts.flatMap((part) =>
											part.type === 'amount' ? [part.value] : [],
										)
								const showUsdPrefix =
									amountTokens.length > 0
										? areUsdPricedTokens(
												TEMPO_CHAIN_ID,
												amountTokens,
												isTokenListed,
											)
										: TEMPO_FEE_TOKEN
											? isTokenListed(TEMPO_CHAIN_ID, TEMPO_FEE_TOKEN)
											: true
								const sideAmount = getReceiptDistinctSideAmount(event)
								const eventNote = getReceiptEventNote(event.note, {
									blockNumber,
									hash,
									timestamp,
								})
								return (
									<div key={`${event.type}-${index}`} {...styles.event()}>
										<div {...styles.eventBody()}>
											<div
												{...cx(
													sideAmount && styles.eventSplit(),
													!sideAmount && styles.eventSingle(),
												)}
											>
												<div {...styles.eventLine()}>
													<div {...styles.eventCounter()}></div>
													<TxEventDescription event={event} />
												</div>
												{sideAmount ? (
													<div {...styles.sideAmount()}>
														<Amount
															{...sideAmount}
															infinite={null}
															prefix={showUsdPrefix ? '$' : undefined}
															short
														/>
													</div>
												) : null}
											</div>
											{eventNote &&
												(typeof eventNote === 'string' ? (
													<TxEventMemoLine
														memo={eventNote}
														className={styles.noteIndent().className}
													/>
												) : (
													<div {...styles.note()}>
														<div {...styles.noteRule()}>
															<div {...styles.noteList()}>
																{eventNote.map(([label, part], index) => {
																	const key = `${label}${index}`
																	const note = getReceiptNotePresentation(
																		label,
																		part,
																	)
																	if (
																		(label === 'from' || label === 'to') &&
																		part.type === 'account'
																	) {
																		return (
																			<div key={key} {...styles.minWidth()}>
																				<TxEventDescription
																					event={{
																						type: 'blocked transfer address',
																						parts: [
																							{ type: 'text', value: label },
																							part,
																						],
																					}}
																				/>
																			</div>
																		)
																	}

																	return (
																		<div key={key} {...styles.noteItem()}>
																			<div {...styles.label()}>
																				{note.kind === 'time' ? (
																					<ClientOnly fallback="Time (UTC)">
																						{note.label}
																					</ClientOnly>
																				) : (
																					note.label
																				)}
																				{!(
																					part.type === 'text' &&
																					part.value === ''
																				) && ':'}
																			</div>
																			{!(
																				part.type === 'text' &&
																				part.value === ''
																			) && (
																				<div {...styles.noteValue()}>
																					<Receipt.NoteValue note={note} />
																				</div>
																			)}
																		</div>
																	)
																})}
															</div>
														</div>
													</div>
												))}
										</div>
									</div>
								)
							})}
						</div>
					</>
				)}
				{(showFeeBreakdown || showSingleFee || hasTotal) && (
					<>
						<div {...styles.divider()} />
						<div {...styles.totals()}>
							{showFeeBreakdown
								? visibleFeeBreakdown.map((item, index) => {
										const showUsdPrefix = hasTokenAmount(item)
											? isUsdPricedToken(TEMPO_CHAIN_ID, item, isTokenListed)
											: showUsdFeePrefix
										const formattedAmount =
											item.display ??
											(showUsdPrefix
												? PriceFormatter.format(item.amount, {
														decimals: item.decimals,
														format: 'short',
													})
												: PriceFormatter.formatAmountShort(
														Value.format(item.amount, item.decimals),
													))
										return (
											<div
												key={`${item.token ?? item.symbol ?? 'fee'}-${index}`}
												{...styles.feeRow()}
											>
												<span {...styles.label()}>
													Fee{' '}
													{item.symbol && (
														<span>
															(
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
															)
														</span>
													)}
												</span>
												<div {...styles.feeAmount()}>
													<span>{formattedAmount}</span>
												</div>
											</div>
										)
									})
								: showSingleFee && (
										<div {...cx(styles.field(), styles.centered())}>
											<span {...styles.label()}>Fee</span>
											<span {...styles.end()}>
												{feeDisplay ??
													(showUsdFeePrefix
														? PriceFormatter.format(fee ?? 0, {
																format: 'short',
															})
														: PriceFormatter.formatAmountShort(
																String(fee ?? 0),
															))}
											</span>
										</div>
									)}
							{hasTotal && (
								<div {...cx(styles.field(), styles.centered())}>
									<span {...styles.totalLabel()}>Total</span>
									<span {...styles.totalValue()}>
										{totalDisplay ??
											(showUsdFeePrefix
												? PriceFormatter.format(total ?? 0, { format: 'short' })
												: PriceFormatter.formatAmountShort(String(total ?? 0)))}
									</span>
								</div>
							)}
						</div>
					</>
				)}
			</div>

			<div {...styles.actions()}>
				<div {...styles.actionsInner()}>
					<div {...styles.actionBar()}>
						<button
							type="button"
							onClick={() => void handleShare()}
							{...cx(styles.action(), transitionColors(), pressDown())}
						>
							<Share {...styles.actionIcon()} />
							<span>Share</span>
						</button>
						<Receipt.ExportLink
							hash={hash}
							format="pdf"
							exportSearch={exportSearch}
						/>
						<Receipt.ExportLink
							hash={hash}
							format="txt"
							exportSearch={exportSearch}
						/>
						<Receipt.ExportLink
							hash={hash}
							format="json"
							exportSearch={exportSearch}
						/>
					</div>
					<Link
						to="/tx/$hash"
						params={{ hash }}
						{...cx(styles.viewTransaction(), transitionColors(), pressDown())}
					>
						<span>View transaction</span>
						<span aria-hidden="true">→</span>
					</Link>
				</div>
			</div>
		</>
	)
}

export namespace Receipt {
	export function TimeRows(props: TimeRows.Props): React.JSX.Element {
		const { timestamp, utc = false } = props
		const iso = new Date(Number(timestamp) * 1_000).toISOString()
		const date = utc
			? iso.slice(0, 10)
			: DateFormatter.formatTimestampDate(timestamp)
		const time = utc
			? { time: iso.slice(11, 19), timezone: 'UTC', offset: '' }
			: DateFormatter.formatTimestampTime(timestamp)
		return (
			<>
				<div {...styles.field()}>
					<span {...styles.label()}>Date</span>
					<time dateTime={iso} {...styles.end()}>
						{date}
					</time>
				</div>
				<div {...styles.field()}>
					<span {...styles.label()}>Time</span>
					<time dateTime={iso} {...styles.end()}>
						{time.time} {time.timezone}
						<span {...styles.label()}>{time.offset}</span>
					</time>
				</div>
			</>
		)
	}

	export namespace TimeRows {
		export interface Props {
			timestamp: bigint
			utc?: boolean | undefined
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
		export interface Props extends TimeRows.Props {
			iso: string
		}
	}

	export function NoteValue(props: NoteValue.Props): React.JSX.Element {
		const { note } = props
		if (note.kind === 'block')
			return (
				<Link
					to="/block/$id"
					params={{ id: note.id }}
					{...cx(link(), linkHover())}
				>
					{BigInt(note.id).toLocaleString()}
				</Link>
			)
		if (note.kind === 'transaction')
			return (
				<Link
					to="/tx/$hash"
					params={{ hash: note.hash }}
					{...cx(styles.noteHash(), mono(), link(), linkHover(), pressDown())}
					title={note.hash}
				>
					<Midcut value={note.hash} prefix="0x" min={4} />
				</Link>
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

	export interface Props {
		blockNumber: bigint
		sender: Address.Address
		hash: Hex.Hex
		timestamp: bigint
		status?: 'success' | 'reverted'
		events?: KnownEvent[]
		fee?: number
		feeDisplay?: string
		total?: number
		totalDisplay?: string
		feeBreakdown?: FeeBreakdownItem[]
		exportSearch?: string | undefined
	}

	export interface FeeBreakdownItem {
		amount: bigint
		decimals: number
		currency: string
		symbol?: string
		token?: Address.Address
		payer?: Address.Address
		display?: string
	}

	export function ExportLink(props: ExportLink.Props): React.JSX.Element {
		const { hash, format, exportSearch = '' } = props
		const icon =
			format === 'pdf' ? (
				<Download {...styles.actionIcon()} />
			) : format === 'txt' ? (
				<Document {...styles.actionIcon()} />
			) : (
				<BracesIcon aria-hidden {...styles.actionIcon()} />
			)

		return (
			<a
				href={`/receipt/${hash}.${format}${exportSearch}`}
				{...cx(styles.action(), transitionColors(), pressDown())}
			>
				{icon}
				<span>{format.toUpperCase()}</span>
			</a>
		)
	}

	export namespace ExportLink {
		export interface Props {
			hash: Hex.Hex
			format: 'pdf' | 'txt' | 'json'
			exportSearch?: string | undefined
		}
	}
}

namespace styles {
	export const card = style({
		backgroundColor: 'background.surface',
		borderBottomWidth: '0px',
		borderColor: 'grayAlpha.200',
		borderTopLeftRadius: 'xl',
		borderTopRightRadius: 'xl',
		borderWidth: '1px',
		boxShadow: 'lg',
		color: 'foreground',
		display: 'flex',
		flexDirection: 'column',
		width: 'min(480px, calc(100vw - 32px)) !custom',
	})

	export const head = style({
		alignItems: 'flex-start',
		display: 'flex',
		gap: '4',
		paddingBottom: '4',
		paddingInline: '6',
		paddingTop: '6',
		'@media (width >= 640px)': { gap: '8' },
	})

	export const mark = style({ flexShrink: '0 !custom' })

	// The wordmark paints with `currentColor`.
	export const wordmark = style({
		color: 'foreground',
		display: 'block',
	})

	export const fields = style({
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		gap: '2',
		minWidth: '0 !custom',
		typography: 'copy.16',
	})

	export const field = style({
		alignItems: 'flex-end',
		display: 'flex',
		justifyContent: 'space-between',
	})

	export const fieldGap = style({ gap: '4' })

	export const centered = style({ alignItems: 'center' })

	export const label = style({
		color: 'gray.900',
		flexShrink: '0 !custom',
	})

	export const blockLink = style({
		textAlign: 'right',
		'::before': { content: '"#"' },
	})

	export const hashLink = style({
		display: 'flex',
		flex: 1,
		justifyContent: 'flex-end',
		minWidth: '0 !custom',
		textAlign: 'right',
	})

	// The descendant selector outranks CopyButton's own display.
	export const hashValue = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		gap: '1',
		justifyContent: 'flex-end',
		minWidth: '0 !custom',
		'@media print': { selectors: { '& > button': { display: 'none' } } },
	})

	export const divider = style({
		borderColor: 'grayAlpha.200',
		borderStyle: 'dashed',
		borderTopWidth: '1px',
	})

	export const events = style({
		counterReset: 'event',
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		paddingBlock: '6',
		paddingInline: '6',
		typography: 'copy.16',
	})

	export const event = style({ counterIncrement: 'event' })

	export const eventBody = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
	})

	export const eventSplit = style({
		display: 'grid',
		gap: '2',
		gridTemplateColumns: 'minmax(0, 1fr)',
		'@media (width >= 640px)': {
			gridTemplateColumns: 'minmax(0, 1fr) auto',
		},
	})

	export const eventSingle = style({ minWidth: '0 !custom' })

	export const eventLine = style({
		alignItems: 'flex-start',
		color: 'gray.900',
		display: 'flex',
		flexDirection: 'row',
		flexGrow: 1,
		gap: '1',
		minWidth: '0 !custom',
	})

	export const eventCounter = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'flex',
		flexShrink: '0 !custom',
		minWidth: '5',
		'::before': { content: 'counter(event) "."' },
	})

	export const sideAmount = style({
		alignItems: 'flex-start',
		display: 'flex',
		justifyContent: 'flex-end',
		minWidth: '0 !custom',
	})

	export const noteIndent = style({ paddingLeft: '6' })

	export const note = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'row',
		gap: '3',
		overflow: 'hidden',
		paddingLeft: '6',
	})

	export const noteRule = style({
		borderColor: 'grayAlpha.200',
		borderLeftWidth: '1px',
		paddingLeft: '3',
		width: '100% !custom',
	})

	export const noteList = style({
		color: 'foreground',
		display: 'flex',
		flexDirection: 'column',
		gap: '1',
		typography: 'copy.14',
	})

	export const minWidth = style({ minWidth: '0 !custom' })

	export const noteItem = style({
		display: 'flex',
		gap: '2',
		minWidth: '0 !custom',
	})

	export const noteValue = style({ flex: 1, minWidth: '0 !custom' })

	export const noteHash = style({ display: 'flex', minWidth: '0 !custom' })

	export const totals = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
		paddingBlock: '6',
		paddingInline: '6',
		typography: 'copy.14',
	})

	export const feeRow = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '2',
		justifyContent: 'space-between',
	})

	export const feeAmount = style({
		alignItems: 'center',
		display: 'flex',
		gap: '2',
	})

	export const end = style({ textAlign: 'right' })

	export const totalLabel = style({
		color: 'foreground',
		typography: 'copy.18.strong',
	})

	export const totalValue = style({
		fontVariantNumeric: 'tabular-nums',
		textAlign: 'right',
		typography: 'heading.20.subtle',
	})

	export const actions = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		marginTop: '-32px !custom',
		width: '100% !custom',
		'@media print': { display: 'none' },
	})

	export const actionsInner = style({
		width: 'min(480px, calc(100vw - 32px)) !custom',
	})

	export const actionBar = style({
		backgroundColor: 'grayAlpha.100',
		borderColor: 'grayAlpha.200',
		borderWidth: '1px',
		color: 'gray.900',
		display: 'grid',
		gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
		typography: 'copy.14',
	})

	export const action = style({
		alignItems: 'center',
		borderColor: 'grayAlpha.200',
		borderRightWidth: '1px',
		display: 'inline-flex',
		gap: '2',
		height: '10',
		justifyContent: 'center',
		'@media (hover: hover)': {
			':hover': {
				backgroundColor: 'background.surface',
				color: 'foreground',
			},
		},
		':last-child': { borderRightWidth: '0px' },
	})

	export const actionIcon = style({
		flexShrink: '0 !custom',
		height: '4',
		width: '4',
	})

	export const viewTransaction = style({
		alignItems: 'center',
		backgroundColor: 'grayAlpha.100',
		borderBottomLeftRadius: 'xl',
		borderBottomRightRadius: 'xl',
		borderColor: 'grayAlpha.200',
		borderWidth: '1px',
		color: 'gray.900',
		display: 'flex',
		gap: '2',
		justifyContent: 'center',
		marginTop: '-1px !custom',
		padding: '3',
		typography: 'copy.14',
		'@media (hover: hover)': {
			':hover': {
				backgroundColor: 'background.surface',
				color: 'foreground',
			},
		},
		':focus-visible': { outlineOffset: '-2px' },
	})
}
