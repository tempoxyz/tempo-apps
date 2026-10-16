import { Link } from '@tanstack/react-router'
import { StatusIndicator, style } from '@tempoxyz/ds/platform'
import { Check, Copy } from '@tempoxyz/ds/platform/icons'
import type { Address, Hex } from 'ox'
import { cx } from 'zyzz'
import { InfoCard } from '#comps/InfoCard'
import { Midcut } from '#comps/Midcut'
import { FormattedTimestamp, useTimeFormat } from '#comps/TimeFormat'
import { useCopy } from '#lib/hooks'
import {
	link,
	linkHover,
	mono,
	pressDown,
	transitionColors,
} from '#styles/explorer'

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
					value: (
						<StatusIndicator
							tone={status === 'success' ? 'positive' : 'negative'}
						>
							{status === 'success' ? 'Success' : 'Failed'}
						</StatusIndicator>
					),
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
					aria-label="Copy transaction hash"
				>
					<span {...styles.copyHeader()}>
						Hash
						{notifying ? <Check /> : <Copy />}
					</span>
					<span {...styles.hashValue()}>{hash}</span>
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
							{...cx(
								styles.address(),
								mono(),
								link(),
								linkHover(),
								pressDown(),
							)}
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
									{...cx(
										styles.address(),
										mono(),
										link(),
										linkHover(),
										pressDown(),
									)}
									title={to}
								>
									<Midcut value={to} prefix="0x" min={4} align="end" />
								</Link>
							),
						}
					: {
							label: 'To',
							value: <span {...styles.secondary()}>Contract Creation</span>,
						},
				<Link
					key="receipt"
					to="/receipt/$hash"
					params={{ hash }}
					{...cx(styles.action(), pressDown())}
				>
					<span {...styles.secondary()}>Receipt</span>
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
					<span {...styles.secondary()}>Simulate</span>
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
		color: 'content.secondary',
		cursor: 'pointer',
		textAlign: 'left',
		width: '100% !custom',
	})

	export const copyHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		marginBottom: '8',
		selectors: { '& > svg': { height: '12', width: '12' } },
	})

	export const hashValue = style({
		color: 'content.primary',
		display: 'block',
		maxWidth: '34ch !custom',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const block = style({ fontVariantNumeric: 'tabular-nums' })

	export const timeGroup = style()

	export const timeToggle = style({
		alignItems: 'center',
		color: 'content.secondary',
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
		fontVariantNumeric: 'tabular-nums',
	})

	export const address = style({
		maxWidth: '50ch !custom',
		width: '100% !custom',
	})

	export const secondary = style({ color: 'content.secondary' })

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
		color: 'content.secondary',
		paddingBlock: '2',
		paddingInline: '8',
		typography: 'body.b3',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
	})

	// Red outline only: red text fails contrast on the light card.
	export const actionPillNegative = style({
		borderColor: 'border.negative',
		color: 'content.primary',
	})
}
