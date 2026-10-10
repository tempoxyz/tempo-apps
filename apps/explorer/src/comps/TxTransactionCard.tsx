import { Link } from '@tanstack/react-router'
import { style, variants } from '@tempoxyz/ds/platform'
import type { Address, Hex } from 'ox'
import { cx } from 'zyzz'
import { InfoCard } from '#comps/InfoCard'
import { Midcut } from '#comps/Midcut'
import { FormattedTimestamp, useTimeFormat } from '#comps/TimeFormat'
import { useCopy } from '#lib/hooks'
import { link, linkHover, pressDown, transitionColors } from '#styles/explorer'
import CopyIcon from '~icons/lucide/copy'

export function TxTransactionCard(props: TxTransactionCard.Props) {
	const { hash, status, error, blockNumber, timestamp, from, to, className } =
		props
	const { copy, notifying } = useCopy()
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
	return (
		<InfoCard
			title={<InfoCard.Title>Transaction</InfoCard.Title>}
			className={className}
			sections={[
				{
					label: 'Status',
					value: <StatusBadge status={status} />,
				},
				...(status === 'reverted' && error
					? [
							{
								label: 'Error',
								value: <span {...styles.error()}>{error}</span>,
							},
						]
					: []),
				<button
					key="hash"
					type="button"
					onClick={() => copy(hash)}
					{...cx(styles.copyHash(), pressDown())}
					title={hash}
					aria-label={
						notifying ? 'Transaction hash copied' : 'Copy transaction hash'
					}
				>
					<div {...styles.copyHeader()}>
						<span {...styles.capitalize()}>Hash</span>
						<div {...styles.copyIconWrap()}>
							<CopyIcon {...styles.copyIcon()} />
							{notifying && <span {...styles.copied()}>copied</span>}
						</div>
					</div>
					<p {...styles.hashValue()}>{hash}</p>
				</button>,
				{
					label: 'Block',
					value: (
						<Link
							to="/block/$id"
							params={{ id: String(blockNumber) }}
							{...cx(styles.block(), link(), linkHover(), pressDown())}
						>
							{blockNumber}
						</Link>
					),
				},
				{
					label: (
						<button
							type="button"
							onClick={cycleTimeFormat}
							{...cx(styles.timeToggle(), styles.timeGroup())}
							title={`Showing ${formatLabel} time - click to change`}
						>
							<span>Time</span>
							<span {...cx(styles.timeFormat(), transitionColors())}>
								{formatLabel}
							</span>
						</button>
					),
					value: (
						<FormattedTimestamp
							timestamp={timestamp}
							format={timeFormat}
							className={styles.timestamp().className}
						/>
					),
				},
				{
					label: 'From',
					value: (
						<Link
							to="/address/$address"
							params={{ address: from }}
							{...cx(styles.address(), link(), linkHover(), pressDown())}
							title={from}
						>
							<Midcut value={from} prefix="0x" min={4} align="end" />
						</Link>
					),
				},
				to
					? {
							label: 'To',
							value: (
								<Link
									to="/address/$address"
									params={{ address: to }}
									{...cx(styles.address(), link(), linkHover(), pressDown())}
									title={to}
								>
									<Midcut value={to} prefix="0x" min={4} align="end" />
								</Link>
							),
						}
					: {
							label: 'To',
							value: <span {...styles.tertiary()}>Contract Creation</span>,
						},
				<Link
					key="receipt"
					to="/receipt/$hash"
					params={{ hash }}
					{...cx(styles.action(), pressDown())}
				>
					<span {...styles.tertiary()}>Receipt</span>
					<span {...cx(styles.actionPill(), transitionColors())}>View →</span>
				</Link>,
				/**
				 * "Why did this fail?" is the most common reason anyone opens a
				 * simulator, and until now there was no way in from the transaction
				 * that raised the question — you retyped every field by hand. `tx`
				 * alone is enough: the simulator loads the transaction, prefills every
				 * call, pins the block to the parent, and runs it.
				 */
				<Link
					key="simulate"
					to="/simulate"
					search={{ tx: hash }}
					{...cx(styles.action(), pressDown())}
					title="Replay this transaction against the state of its parent block"
				>
					<span {...styles.tertiary()}>Simulate</span>
					<span
						{...cx(
							styles.actionPill(),
							transitionColors(),
							status === 'reverted' && styles.actionPillNegative(),
						)}
					>
						{status === 'reverted' ? 'Debug →' : 'Re-run →'}
					</span>
				</Link>,
			]}
		/>
	)
}

function StatusBadge(props: { status: 'success' | 'reverted' }) {
	const { status } = props
	const isSuccess = status === 'success'
	return (
		<span {...styles.status({ tone: isSuccess ? 'positive' : 'negative' })}>
			{isSuccess ? 'Success' : 'Failed'}
		</span>
	)
}

export declare namespace TxTransactionCard {
	type Props = {
		hash: Hex.Hex
		status: 'success' | 'reverted'
		error?: string | undefined
		blockNumber: bigint
		timestamp: bigint
		from: Address.Address
		to: Address.Address | null
		className?: string
	}
}

namespace styles {
	export const error = style({
		color: 'content.primary',
		textAlign: 'right',
		typography: 'body.b2',
	})

	export const copyHash = style({
		color: 'content.tertiary',
		cursor: 'pointer',
		textAlign: 'left',
		width: '100% !custom',
	})

	export const copyHeader = style({
		alignItems: 'center',
		display: 'flex',
		fontFamily: 'Pilat, Arial, sans-serif',
		gap: '8',
		marginBottom: '8',
	})

	export const capitalize = style({ textTransform: 'capitalize' })

	export const copyIconWrap = style({
		alignItems: 'center',
		display: 'flex',
		position: 'relative',
	})

	export const copyIcon = style({ height: '12', width: '12' })

	export const copied = style({
		left: 'calc(100% + 8px) !custom',
		position: 'absolute',
	})

	export const hashValue = style({
		color: 'content.primary',
		maxWidth: '34ch !custom',
		typography: 'mono.inline',
		lineHeight: '1.625 !custom',
		wordBreak: 'break-all',
	})

	export const block = style({
		fontFamily: 'Pilat, Arial, sans-serif',
		fontVariantNumeric: 'tabular-nums',
	})

	export const timeGroup = style()

	export const timeToggle = style({
		alignItems: 'center',
		color: 'content.tertiary',
		cursor: 'pointer',
		display: 'inline-flex',
		gap: '8',
	})

	export const timeFormat = style({
		backgroundColor: 'container.subtle',
		borderRadius: 'full',
		color: 'content.primary',
		paddingBlock: '2',
		paddingInline: '8',
		textTransform: 'capitalize',
		typography: 'body.b3',
		'@media (hover: hover)': {
			selectors: {
				[`${timeGroup}:hover &`]: { backgroundColor: 'container.regular' },
			},
		},
	})

	export const timestamp = style({
		color: 'content.primary',
		fontFamily: 'Pilat, Arial, sans-serif',
		fontVariantNumeric: 'tabular-nums',
	})

	export const address = style({
		fontFamily: '"JetBrains Mono", monospace',
		fontWeight: 400,
		letterSpacing: '0px',
		maxWidth: '50ch !custom',
		width: '100% !custom',
	})

	export const tertiary = style({ color: 'content.tertiary' })

	export const action = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
		paddingBlock: '8',
		width: '100% !custom',
		'@media print': { display: 'none' },
	})

	export const actionPill = style({
		borderColor: 'line.secondary',
		borderRadius: 'full',
		borderStyle: 'solid',
		borderWidth: 'regular',
		color: 'content.tertiary',
		paddingBlock: '2',
		paddingInline: '8',
		typography: 'body.b3',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
	})

	export const actionPillNegative = style({
		borderColor: 'border.negative',
		color: 'content.negative',
		'@media (hover: hover)': { ':hover': { color: 'content.negative' } },
	})

	export const status = variants({
		base: {
			borderRadius: '3xs',
			paddingBlock: '2',
			paddingInline: '8',
			typography: 'body.b3',
		},
		defaultVariants: { tone: 'positive' },
		variants: {
			tone: {
				negative: {
					backgroundColor: 'container.negative',
					color: 'content.negative',
				},
				positive: {
					backgroundColor: 'container.positive',
					color: 'content.positive',
				},
			},
		},
	})
}
