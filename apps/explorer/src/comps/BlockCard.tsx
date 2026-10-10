import { Link } from '@tanstack/react-router'
import { style, variants } from '@tempoxyz/ds/platform'
import type { Hex } from 'ox'
import * as React from 'react'
import { cx } from 'zyzz'
import { InfoCard } from '#comps/InfoCard'
import { Midcut } from '#comps/Midcut'
import { ValidatorTag } from '#comps/ValidatorTag'
import { useAnimatedBlockNumber } from '#lib/block-number'
import { DateFormatter } from '#lib/formatting'
import { useCopy, useIsMounted } from '#lib/hooks'
import type { BlockWithTransactions } from '#lib/queries'
import { link, linkHover, pressDown } from '#styles/explorer'
import ArrowUp10 from '~icons/lucide/arrow-up-1-0'
import ChevronDown from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'

export function BlockCard(props: BlockCard.Props) {
	const { block } = props
	const {
		number: blockNumber,
		hash,
		timestamp,
		parentHash,
		miner,
		gasUsed,
		gasLimit,
		stateRoot,
		transactionsRoot,
		receiptsRoot,
	} = block

	const [showAdvanced, setShowAdvanced] = React.useState(false)

	const copyBlock = useCopy()
	const copyHash = useCopy()

	const confirmationsRef = React.useRef<HTMLSpanElement>(null)
	const latestBlockRef = React.useRef(blockNumber ?? 0n)
	const isMounted = useIsMounted()
	const liveBlockNumber = useAnimatedBlockNumber()

	const getConfirmations = React.useCallback(
		(latest?: bigint) => {
			if (!blockNumber || !latest || latest < blockNumber) return undefined
			return Number(latest - blockNumber) + 1
		},
		[blockNumber],
	)

	React.useEffect(() => {
		if (!isMounted || liveBlockNumber == null) return
		if (liveBlockNumber > (latestBlockRef.current ?? 0n)) {
			latestBlockRef.current = liveBlockNumber
			const confirmations = getConfirmations(liveBlockNumber)
			if (confirmationsRef.current) {
				confirmationsRef.current.textContent =
					confirmations !== undefined ? String(confirmations) : '—'
			}
		}
	}, [isMounted, liveBlockNumber, getConfirmations])

	const utcFormatted = timestamp
		? DateFormatter.formatUtcTimestamp(timestamp)
		: undefined
	const [utcDate, utcTime] = utcFormatted?.split(', ') ?? []

	const gasUsage = BlockCard.getGasUsagePercent(gasUsed, gasLimit)
	const roots = [
		{ label: 'state', value: stateRoot },
		{ label: 'txns', value: transactionsRoot },
		{ label: 'receipts', value: receiptsRoot },
	]

	const showAdvancedSection = true

	return (
		<InfoCard
			sections={[
				<button
					key="block-number"
					type="button"
					onClick={() => copyBlock.copy(String(blockNumber ?? 0n))}
					{...cx(styles.copyButton(), pressDown())}
					title={String(blockNumber ?? 0n)}
				>
					<div {...styles.copyHeader()}>
						<span>Block</span>
						<div {...styles.copyIconSlot()}>
							<CopyIcon {...styles.icon({ size: 'small' })} />
							{copyBlock.notifying && <span {...styles.copied()}>copied</span>}
						</div>
					</div>
					<BlockCard.BlockNumber value={blockNumber ?? 0n} />
				</button>,
				<div key="time" {...styles.stack({ gap: 'compact' })}>
					<BlockCard.TimeRow
						label="UTC"
						value={
							<time dateTime={new Date(Number(timestamp) * 1000).toISOString()}>
								<span {...styles.primary()}>{utcDate}</span>
								{utcTime && <> {utcTime}</>}
							</time>
						}
					/>
					<BlockCard.TimeRow label="UNIX" value={String(timestamp)} />
				</div>,
				<div key="hash-parent" {...styles.stack({ gap: 'relaxed' })}>
					{hash && (
						<button
							type="button"
							onClick={() => copyHash.copy(hash)}
							{...cx(styles.copyButton(), pressDown())}
							title={hash}
						>
							<div {...styles.copyHeader()}>
								<span {...styles.fieldName()}>Hash</span>
								<div {...styles.copyIconSlot()}>
									<CopyIcon {...styles.icon({ size: 'small' })} />
									{copyHash.notifying && (
										<span {...styles.copied()}>copied</span>
									)}
								</div>
							</div>
							{/* 22 chars/line: mono.inline has no tracking */}
							<div {...styles.hash()}>{hash}</div>
						</button>
					)}
					<div {...styles.infoRow()}>
						<span {...styles.parentLabel()}>
							<ArrowUp10 {...styles.icon({ size: 'medium' })} />
							Parent
						</span>
						<Link
							to="/block/$id"
							params={{ id: parentHash }}
							{...cx(styles.parentLink(), link(), linkHover(), pressDown())}
							title={parentHash}
						>
							<Midcut value={parentHash} prefix="0x" align="end" min={4} />
						</Link>
					</div>
				</div>,
				<div key="miner-confirmations" {...styles.stack({ gap: 'compact' })}>
					<BlockCard.InfoRow label="Miner">
						{miner ? (
							<ValidatorTag address={miner} />
						) : (
							<span {...styles.tertiary()}>—</span>
						)}
					</BlockCard.InfoRow>
					<BlockCard.InfoRow label="Confirmations">
						<span ref={confirmationsRef} {...styles.numeric()}>
							<span {...styles.secondary()}>—</span>
						</span>
					</BlockCard.InfoRow>
				</div>,
				showAdvancedSection && (
					<div key="advanced" {...styles.advanced()}>
						<button
							type="button"
							{...cx(styles.advancedToggle(), pressDown())}
							onClick={() => setShowAdvanced((prev) => !prev)}
						>
							<span>Advanced</span>
							<ChevronDown
								{...styles.advancedChevron({ open: showAdvanced })}
							/>
						</button>

						{showAdvanced && (
							// Contain inline size so full-length root hashes don't widen the card.
							<div {...styles.advancedContent()}>
								<div {...styles.gas()}>
									<div {...styles.spread()}>
										<span {...styles.secondary()}>Gas Usage</span>
										<span {...styles.numeric()}>
											{gasUsage !== undefined
												? `${gasUsage.toFixed(2)}%`
												: '0.00%'}
										</span>
									</div>
									<div {...styles.gasTrack()}>
										<div
											{...styles.gasFill({
												style: {
													width: `max(4px, ${Math.min(100, gasUsage ?? 0)}%)`,
												},
											})}
										/>
									</div>
									<div {...styles.gasValues()}>
										<BlockCard.GasValue value={gasUsed} />
										<BlockCard.GasValue value={gasLimit} highlight={false} />
									</div>
								</div>

								<div {...styles.roots()}>
									<div {...styles.secondary()}>Roots</div>
									{roots.map((root) => (
										<BlockCard.RootRow
											key={root.label}
											label={root.label}
											hash={root.value}
										/>
									))}
								</div>
							</div>
						)}
					</div>
				),
			]}
		/>
	)
}

export namespace BlockCard {
	export interface Props {
		block: BlockWithTransactions
	}

	export function TimeRow(props: TimeRow.Props) {
		const { label, value } = props
		return (
			<div {...styles.timeRow()}>
				<span {...styles.timeLabel()}>{label}</span>
				<span {...styles.timeValue()}>{value}</span>
			</div>
		)
	}

	export namespace TimeRow {
		export interface Props {
			label: string
			value?: React.ReactNode
		}
	}

	export function BlockNumber(props: BlockNumber.Props) {
		const { value } = props
		const str = String(value).padStart(15, '0')
		const zerosEnd = str.match(/^0*/)?.[0].length ?? 0
		return (
			<div {...styles.blockNumber()}>
				<span {...styles.blockNumberDigits()}>
					{str.split('').map((char, index) => (
						<span
							key={`${index}-${char}`}
							{...styles.digit({ significant: index >= zerosEnd })}
						>
							{char}
						</span>
					))}
				</span>
			</div>
		)
	}

	export namespace BlockNumber {
		export interface Props {
			value: bigint
		}
	}

	export function InfoRow(props: InfoRow.Props) {
		const { label, children } = props
		return (
			<div {...styles.infoRow()}>
				<span {...styles.infoLabel()}>{label}</span>
				{children}
			</div>
		)
	}

	export namespace InfoRow {
		export interface Props {
			label: string
			children: React.ReactNode
		}
	}

	export function GasValue(props: GasValue.Props) {
		const { value, digits = 9, highlight = true } = props
		if (value === undefined) return <span>—</span>
		const str = String(value).padStart(digits, '0')
		const zeros = str.match(/^0*/)?.[0] ?? ''
		const number = str.slice(zeros.length)
		return (
			<span>
				{zeros}
				{highlight ? <span {...styles.primary()}>{number}</span> : number}
			</span>
		)
	}

	export namespace GasValue {
		export interface Props {
			value?: bigint
			digits?: number
			highlight?: boolean
		}
	}

	export function RootRow(props: RootRow.Props) {
		const { label, hash } = props
		const { copy, notifying } = useCopy()

		if (!hash) {
			return (
				<div {...styles.rootRow()}>
					<span {...styles.rootLabel()}>{label}</span>
					<span {...styles.tertiary()}>—</span>
				</div>
			)
		}

		return (
			<button
				type="button"
				onClick={() => copy(hash)}
				{...cx(styles.rootRow(), styles.rootButton(), pressDown())}
				title={hash}
			>
				<span {...styles.rootLabel()}>{notifying ? 'copied' : label}</span>
				<div {...styles.rootHash()}>
					<Midcut value={hash} prefix="0x" align="end" min={4} />
					<CopyIcon {...styles.icon({ size: 'small' })} />
				</div>
			</button>
		)
	}

	export namespace RootRow {
		export interface Props {
			label: string
			hash?: Hex.Hex
		}
	}

	export function getGasUsagePercent(gasUsed?: bigint, gasLimit?: bigint) {
		if (!gasUsed || !gasLimit) return undefined
		const used = Number(gasUsed)
		const limit = Number(gasLimit)
		if (!limit) return undefined
		return (used / limit) * 100
	}
}

namespace styles {
	export const primary = style({ color: 'content.primary' })

	export const secondary = style({ color: 'content.secondary' })

	export const tertiary = style({ color: 'content.tertiary' })

	export const numeric = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
	})

	export const icon = variants({
		base: { color: 'content.tertiary', flexShrink: 0 },
		defaultVariants: { size: 'small' },
		variants: {
			size: {
				small: { height: '12px !custom', width: '12px !custom' },
				medium: { height: '14px !custom', width: '14px !custom' },
			},
		},
	})

	export const copyButton = style({
		color: 'content.tertiary',
		cursor: 'pointer',
		textAlign: 'left',
		width: '100% !custom',
	})

	export const copyHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		marginBottom: '8',
	})

	export const copyIconSlot = style({
		alignItems: 'center',
		display: 'flex',
		position: 'relative',
	})

	export const copied = style({
		left: 'calc(100% + 8px) !custom',
		position: 'absolute',
	})

	export const fieldName = style({ textTransform: 'capitalize' })

	export const hash = style({
		color: 'content.primary',
		maxWidth: '22ch !custom',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const stack = variants({
		base: {
			display: 'flex',
			flexDirection: 'column',
			width: '100% !custom',
		},
		defaultVariants: { gap: 'compact' },
		variants: { gap: { compact: { gap: '8' }, relaxed: { gap: '12' } } },
	})

	export const infoRow = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		width: '100% !custom',
	})

	export const infoLabel = style({
		color: 'content.tertiary',
		flexShrink: 0,
		textTransform: 'capitalize',
	})

	export const parentLabel = style({
		alignItems: 'center',
		color: 'content.tertiary',
		display: 'flex',
		flexShrink: 0,
		gap: '8',
		textTransform: 'capitalize',
	})

	export const parentLink = style({
		display: 'flex',
		flex: 1,
		justifyContent: 'flex-end',
		maxWidth: '18ch !custom',
		minWidth: '0px !custom',
		typography: 'mono.inline',
	})

	// Spans the whole InfoCard section (12px / 20px padding) so the toggle row
	// reads as one target, then restores the padding inside.
	export const advanced = style({
		marginBlock: '-12px !custom',
		marginInline: '-20px !custom',
		paddingBlock: '12',
		paddingInline: '20',
		width: 'calc(100% + 40px) !custom',
	})

	export const advancedToggle = style({
		alignItems: 'center',
		color: 'content.tertiary',
		cursor: 'pointer',
		display: 'flex',
		justifyContent: 'space-between',
		width: '100% !custom',
	})

	export const advancedChevron = variants({
		base: {
			color: 'content.tertiary',
			height: '14px !custom',
			width: '14px !custom',
		},
		defaultVariants: { open: false },
		variants: { open: { true: { rotate: '180deg' }, false: {} } },
	})

	export const advancedContent = style({
		contain: 'inline-size',
		marginTop: '16',
		paddingBottom: '16',
		width: '100% !custom',
		selectors: { '& > :not(:last-child)': { marginBottom: '20' } },
	})

	export const gas = style({
		selectors: { '& > :not(:last-child)': { marginBottom: '12' } },
	})

	export const spread = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
	})

	export const gasTrack = style({
		alignItems: 'center',
		backgroundColor: 'line.secondary',
		borderRadius: 'full',
		display: 'flex',
		height: '6px !custom',
		overflow: 'hidden',
		paddingInline: '1px !custom',
	})

	export const gasFill = style({
		backgroundColor: 'component.button.primary.fill',
		borderRadius: 'full',
		height: '100% !custom',
	})

	export const gasValues = style({
		alignItems: 'center',
		color: 'content.tertiary',
		display: 'flex',
		fontVariantNumeric: 'tabular-nums',
		justifyContent: 'space-between',
	})

	export const roots = style({
		selectors: { '& > :not(:last-child)': { marginBottom: '8' } },
	})

	export const timeRow = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
		width: '100% !custom',
	})

	export const timeLabel = style({
		backgroundColor: 'container.subtle',
		borderRadius: '3xs',
		color: 'content.tertiary',
		paddingBlock: '2',
		paddingInline: '4',
		typography: 'body.b3',
	})

	export const timeValue = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
		textAlign: 'right',
	})

	export const blockNumber = style({ fontVariantNumeric: 'tabular-nums' })

	export const blockNumberDigits = style({
		color: 'content.tertiary',
		display: 'flex',
		gap: '1px !custom',
		justifyContent: 'space-between',
		typography: 'heading.h2',
		userSelect: 'none',
	})

	export const digit = variants({
		base: {},
		defaultVariants: { significant: false },
		variants: {
			significant: { true: { color: 'content.primary' }, false: {} },
		},
	})

	export const rootRow = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		textTransform: 'lowercase',
	})

	export const rootButton = style({
		cursor: 'pointer',
		width: '100% !custom',
	})

	export const rootLabel = style({
		color: 'content.tertiary',
		flexShrink: 0,
	})

	export const rootHash = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		gap: '8',
		justifyContent: 'flex-end',
		minWidth: '0px !custom',
		typography: 'mono.inline',
	})
}
