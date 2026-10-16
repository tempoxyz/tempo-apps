import { Link } from '@tanstack/react-router'
import { Progress, style, variants } from '@tempoxyz/ds/platform'
import {
	Check,
	ChevronDown,
	Copy,
	FilterDescending,
} from '@tempoxyz/ds/platform/icons'
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

export function BlockCard(props: BlockCard.Props): React.JSX.Element {
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
					<span {...styles.copyHeader()}>
						<span>Block</span>
						<BlockCard.CopyIcon copied={copyBlock.notifying} />
					</span>
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
							<span {...styles.copyHeader()}>
								<span>Hash</span>
								<BlockCard.CopyIcon copied={copyHash.notifying} />
							</span>
							{/* 22 chars/line: mono.inline has no tracking */}
							<span {...styles.hash()}>{hash}</span>
						</button>
					)}
					<div {...styles.infoRow()}>
						<span {...styles.parentLabel()}>
							<FilterDescending {...styles.icon()} />
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
							<span {...styles.secondary()}>—</span>
						)}
					</BlockCard.InfoRow>
					<BlockCard.InfoRow label="Confirmations">
						<span ref={confirmationsRef} {...styles.numeric()}>
							<span {...styles.secondary()}>—</span>
						</span>
					</BlockCard.InfoRow>
				</div>,
				<div key="advanced" {...styles.advanced()}>
					<button
						type="button"
						aria-expanded={showAdvanced}
						{...cx(styles.advancedToggle(), pressDown())}
						onClick={() => setShowAdvanced((prev) => !prev)}
					>
						<span>Advanced</span>
						<ChevronDown {...styles.advancedChevron({ open: showAdvanced })} />
					</button>

					{showAdvanced && (
						// Contain inline size so full-length root hashes don't widen the card.
						<div {...styles.advancedContent()}>
							<div {...styles.gas()}>
								{/* Base UI formats Progress values as whole percents, and most
								    blocks use well under 1% of the limit, so the label row
								    shows two decimals. */}
								<div {...styles.spread()}>
									<span>Gas Usage</span>
									<span {...styles.numeric()}>
										{`${(gasUsage ?? 0).toFixed(2)}%`}
									</span>
								</div>
								<Progress
									aria-label="Gas usage"
									value={Math.min(100, gasUsage ?? 0)}
									style={{ width: '100%' }}
								/>
								<div {...styles.gasValues()}>
									<BlockCard.GasValue value={gasUsed} />
									<BlockCard.GasValue value={gasLimit} highlight={false} />
								</div>
							</div>

							<div {...styles.roots()}>
								<div>Roots</div>
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
				</div>,
			]}
		/>
	)
}

export namespace BlockCard {
	export interface Props {
		block: BlockWithTransactions
	}

	/** Copy glyph that confirms with a check while the copy is announced. */
	export function CopyIcon(props: CopyIcon.Props): React.JSX.Element {
		return props.copied ? (
			<Check {...styles.icon()} />
		) : (
			<Copy {...styles.icon()} />
		)
	}

	export namespace CopyIcon {
		export interface Props {
			copied: boolean
		}
	}

	export function TimeRow(props: TimeRow.Props): React.JSX.Element {
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

	export function BlockNumber(props: BlockNumber.Props): React.JSX.Element {
		const { value } = props
		const str = String(value).padStart(15, '0')
		const zerosEnd = str.match(/^0*/)?.[0].length ?? 0
		return (
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
		)
	}

	export namespace BlockNumber {
		export interface Props {
			value: bigint
		}
	}

	export function InfoRow(props: InfoRow.Props): React.JSX.Element {
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

	/** A zero-padded gas amount; the leading zeros are dimmed. */
	export function GasValue(props: GasValue.Props): React.JSX.Element {
		const { value, highlight = true } = props
		if (value === undefined) return <span>—</span>
		const str = String(value).padStart(9, '0')
		const zeros = str.match(/^0*/)?.[0] ?? ''
		const number = str.slice(zeros.length)
		return (
			<span>
				<span {...styles.tertiary()}>{zeros}</span>
				<span {...styles.gasNumber({ highlight })}>{number}</span>
			</span>
		)
	}

	export namespace GasValue {
		export interface Props {
			value?: bigint
			highlight?: boolean
		}
	}

	export function RootRow(props: RootRow.Props): React.JSX.Element {
		const { label, hash } = props
		const { copy, notifying } = useCopy()

		if (!hash) {
			return (
				<div {...styles.rootRow()}>
					<span {...styles.rootLabel()}>{label}</span>
					<span {...styles.secondary()}>—</span>
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
				<span {...styles.rootLabel()}>{label}</span>
				<span {...styles.rootHash()}>
					<Midcut value={hash} prefix="0x" align="end" min={4} />
					<BlockCard.CopyIcon copied={notifying} />
				</span>
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

	export const icon = style({
		color: 'content.secondary',
		flexShrink: 0,
		height: '12',
		width: '12',
	})

	export const copyButton = style({
		color: 'content.secondary',
		cursor: 'pointer',
		display: 'block',
		textAlign: 'left',
		width: '100% !custom',
	})

	export const copyHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		marginBottom: '8',
	})

	export const hash = style({
		color: 'content.primary',
		display: 'block',
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
		color: 'content.secondary',
		flexShrink: 0,
	})

	export const parentLabel = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		flexShrink: 0,
		gap: '8',
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
		color: 'content.secondary',
		cursor: 'pointer',
		display: 'flex',
		justifyContent: 'space-between',
		width: '100% !custom',
	})

	export const advancedChevron = variants({
		base: {
			color: 'content.secondary',
			height: '16',
			width: '16',
		},
		defaultVariants: { open: false },
		variants: { open: { true: { rotate: '180deg' }, false: {} } },
	})

	export const advancedContent = style({
		color: 'content.secondary',
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

	export const gasValues = style({
		alignItems: 'center',
		display: 'flex',
		fontVariantNumeric: 'tabular-nums',
		justifyContent: 'space-between',
	})

	export const gasNumber = variants({
		base: {},
		defaultVariants: { highlight: true },
		variants: {
			highlight: {
				true: { color: 'content.primary' },
				false: { color: 'content.secondary' },
			},
		},
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
		color: 'content.secondary',
		paddingBlock: '2',
		paddingInline: '4',
		typography: 'body.b3',
	})

	export const timeValue = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
		textAlign: 'right',
	})

	export const blockNumberDigits = style({
		color: 'content.tertiary',
		display: 'flex',
		fontVariantNumeric: 'tabular-nums',
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
	})

	export const rootButton = style({
		cursor: 'pointer',
		width: '100% !custom',
	})

	export const rootLabel = style({
		color: 'content.secondary',
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
