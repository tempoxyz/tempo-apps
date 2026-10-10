import { ClientOnly, Link } from '@tanstack/react-router'
import { style, vars } from '@tempoxyz/ds/platform'
import type { Address, Hex } from 'ox'
import * as Value from 'ox/Value'
import { cx } from 'zyzz'
import { Amount } from '#comps/Amount'
import { CopyButton } from '#comps/CopyButton'
import { Midcut } from '#comps/Midcut'
import { ReceiptMark } from '#comps/ReceiptMark'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { TxEventDescription, TxEventMemoLine } from '#comps/TxEventDescription'
import type { KnownEvent } from '#lib/domain/known-events'
import { isReceiptEventVisible } from '#lib/domain/receipt-presentation'
import {
	getReceiptDistinctSideAmount,
	getReceiptEventNote,
	getReceiptNotePresentation,
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
import { link, pressDown, transitionColors } from '#styles/explorer'
import { getTempoChain } from '#wagmi.config.ts'
import BracesIcon from '~icons/lucide/braces'
import DownloadIcon from '~icons/lucide/download'
import FileTextIcon from '~icons/lucide/file-text'
import ShareIcon from '~icons/lucide/share-2'

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
	const copyShare = useCopy({ timeout: 2_000 })
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
	const filteredEvents = events.filter(isReceiptEventVisible)
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
						<ReceiptMark />
					</div>
					<div {...styles.fields()}>
						<div {...styles.field()}>
							<span {...styles.tertiary()}>Block</span>
							<Link
								to="/block/$id"
								params={{ id: blockNumber.toString() }}
								{...cx(styles.blockLink(), link(), pressDown())}
							>
								{String(blockNumber)}
							</Link>
						</div>
						<div {...cx(styles.field(), styles.fieldGap())}>
							<span {...styles.fieldLabel()}>Sender</span>
							<Link
								to="/address/$address"
								params={{ address: sender }}
								{...cx(styles.hashLink(), link(), pressDown())}
							>
								<Midcut value={sender} prefix="0x" align="end" min={4} />
							</Link>
						</div>
						<div {...cx(styles.field(), styles.fieldGap(), styles.centered())}>
							<span {...styles.fieldLabel()}>Hash</span>
							<div {...styles.hashValue()}>
								<Link
									to="/tx/$hash"
									params={{ hash }}
									{...cx(styles.hashLink(), link(), pressDown())}
									title={hash}
								>
									<Midcut value={hash} prefix="0x" align="end" min={4} />
								</Link>
								<CopyButton
									value={hash}
									ariaLabel="Copy transaction hash"
									className={styles.copyHash().className}
								/>
							</div>
						</div>
						<ClientOnly
							fallback={<Receipt.TimeRows timestamp={timestamp} utc />}
						>
							<Receipt.TimeRows timestamp={timestamp} />
						</ClientOnly>
						{status === 'reverted' && (
							<div {...styles.field()}>
								<span {...styles.tertiary()}>Status</span>
								<span {...styles.failed()}>Failed</span>
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
																			<div {...styles.fieldLabel()}>
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
												<span {...styles.tertiary()}>
													Fee{' '}
													{item.symbol && (
														<span>
															(
															{item.token ? (
																<Link
																	to="/token/$address"
																	params={{ address: item.token }}
																	{...cx(styles.positive(), pressDown())}
																>
																	{item.symbol}
																</Link>
															) : (
																<span {...styles.positive()}>
																	{item.symbol}
																</span>
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
											<span {...styles.tertiary()}>Fee</span>
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
							<ShareIcon {...styles.actionIcon()} />
							<span>{copyShare.notifying ? 'Copied' : 'Share'}</span>
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
						{...cx(styles.viewTransaction(), pressDown())}
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
					<span {...styles.tertiary()}>Date</span>
					<time dateTime={iso} {...styles.end()}>
						{date}
					</time>
				</div>
				<div {...styles.field()}>
					<span {...styles.tertiary()}>Time</span>
					<time dateTime={iso} {...styles.end()}>
						{time.time} {time.timezone}
						<span {...styles.tertiary()}>{time.offset}</span>
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
					{...cx(link(), pressDown())}
				>
					{BigInt(note.id).toLocaleString()}
				</Link>
			)
		if (note.kind === 'transaction')
			return (
				<Link
					to="/tx/$hash"
					params={{ hash: note.hash }}
					{...cx(styles.noteHash(), link(), pressDown())}
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
				<DownloadIcon {...styles.actionIcon()} />
			) : format === 'txt' ? (
				<FileTextIcon {...styles.actionIcon()} />
			) : (
				<BracesIcon {...styles.actionIcon()} />
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
		backgroundColor: 'background.secondary',
		borderBottomWidth: 'none',
		borderColor: 'line.secondary',
		borderTopLeftRadius: 'xs',
		borderTopRightRadius: 'xs',
		borderWidth: 'regular',
		boxShadow: `0 1px 2px ${vars.color.shadow.secondary}, 0 8px 24px ${vars.color.shadow.primary}`,
		color: 'content.primary',
		display: 'flex',
		flexDirection: 'column',
		width: 'min(480px, calc(100vw - 32px)) !custom',
	})

	export const head = style({
		alignItems: 'flex-start',
		display: 'flex',
		gap: '16',
		paddingBottom: '16',
		paddingInline: '24',
		paddingTop: '24',
		'@media (width >= 640px)': { gap: '32' },
	})

	export const mark = style({ flexShrink: '0 !custom' })

	export const fields = style({
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		gap: '8',
		minWidth: '0 !custom',
		typography: 'body.b1',
	})

	export const field = style({
		alignItems: 'flex-end',
		display: 'flex',
		justifyContent: 'space-between',
	})

	export const fieldGap = style({ gap: '16' })

	export const centered = style({ alignItems: 'center' })

	export const tertiary = style({ color: 'content.tertiary' })

	export const fieldLabel = style({
		color: 'content.tertiary',
		flexShrink: '0 !custom',
	})

	export const blockLink = style({
		textAlign: 'right',
		'::before': { content: '"#"' },
	})

	export const hashLink = style({
		display: 'flex',
		flex: 1,
		fontFamily: '"JetBrains Mono", monospace',
		justifyContent: 'flex-end',
		minWidth: '0 !custom',
		textAlign: 'right',
	})

	export const hashValue = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		gap: '4',
		justifyContent: 'flex-end',
		minWidth: '0 !custom',
	})

	// CopyButton sets its own display, so the print rule needs !important.
	export const copyHash = style({
		flexShrink: '0 !custom',
		'@media print': { display: 'none !important' },
	})

	export const failed = style({
		color: 'content.negative',
		typography: 'body.b3',
	})

	export const divider = style({
		borderColor: 'line.secondary',
		borderStyle: 'dashed',
		borderTopWidth: 'regular',
	})

	export const events = style({
		counterReset: 'event',
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		paddingBlock: '24',
		paddingInline: '24',
		typography: 'body.b1',
	})

	export const event = style({ counterIncrement: 'event' })

	export const eventBody = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const eventSplit = style({
		display: 'grid',
		gap: '8',
		gridTemplateColumns: 'minmax(0, 1fr)',
		'@media (width >= 640px)': {
			gridTemplateColumns: 'minmax(0, 1fr) auto',
		},
	})

	export const eventSingle = style({ minWidth: '0 !custom' })

	export const eventLine = style({
		alignItems: 'flex-start',
		color: 'content.tertiary',
		display: 'flex',
		flexDirection: 'row',
		flexGrow: 1,
		gap: '4',
		minWidth: '0 !custom',
	})

	export const eventCounter = style({
		alignItems: 'center',
		color: 'content.tertiary',
		display: 'flex',
		flexShrink: '0 !custom',
		minWidth: '20px !custom',
		'::before': { content: 'counter(event) "."' },
	})

	export const sideAmount = style({
		alignItems: 'flex-start',
		display: 'flex',
		justifyContent: 'flex-end',
		minWidth: '0 !custom',
	})

	export const noteIndent = style({ paddingLeft: '24' })

	export const note = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'row',
		gap: '12',
		overflow: 'hidden',
		paddingLeft: '24',
	})

	export const noteRule = style({
		borderColor: 'line.secondary',
		borderLeftWidth: 'regular',
		paddingLeft: '12',
		width: '100% !custom',
	})

	export const noteList = style({
		color: 'content.primary',
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		typography: 'body.b2',
	})

	export const minWidth = style({ minWidth: '0 !custom' })

	export const noteItem = style({
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const noteValue = style({ flex: 1, minWidth: '0 !custom' })

	export const noteHash = style({
		display: 'flex',
		fontFamily: '"JetBrains Mono", monospace',
		minWidth: '0 !custom',
	})

	export const totals = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingBlock: '24',
		paddingInline: '24',
		typography: 'body.b2',
	})

	export const feeRow = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		justifyContent: 'space-between',
	})

	export const positive = style({ color: 'content.positive' })

	export const feeAmount = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const end = style({ textAlign: 'right' })

	export const totalLabel = style({
		color: 'content.primary',
		typography: 'heading.h4',
	})

	export const totalValue = style({
		fontVariantNumeric: 'tabular-nums',
		textAlign: 'right',
		typography: 'heading.h3',
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
		backgroundColor: 'container.regular',
		borderColor: 'line.secondary',
		borderWidth: 'regular',
		color: 'content.secondary',
		display: 'grid',
		gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
		typography: 'body.b2',
	})

	export const action = style({
		alignItems: 'center',
		borderColor: 'line.secondary',
		borderRightWidth: 'regular',
		display: 'inline-flex',
		gap: '8',
		height: '40',
		justifyContent: 'center',
		'@media (hover: hover)': {
			':hover': {
				backgroundColor: 'background.secondary',
				color: 'content.primary',
			},
		},
		':last-child': { borderRightWidth: 'none' },
	})

	export const actionIcon = style({
		height: '13px !custom',
		width: '13px !custom',
	})

	export const viewTransaction = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderBottomLeftRadius: 'xs',
		borderBottomRightRadius: 'xs',
		borderColor: 'line.secondary',
		borderWidth: 'regular',
		color: 'content.tertiary',
		display: 'flex',
		gap: '8',
		justifyContent: 'center',
		marginTop: '-1px !custom',
		padding: '12',
		transitionDuration: '100ms',
		transitionProperty: 'background-color, color',
		transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
		typography: 'body.b2',
		'@media (hover: hover)': {
			':hover': {
				backgroundColor: 'background.secondary',
				color: 'content.primary',
			},
		},
		':focus-visible': { outlineOffset: '-2px' },
	})
}
