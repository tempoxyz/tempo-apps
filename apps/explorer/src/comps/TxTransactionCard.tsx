import { Link } from '@tanstack/react-router'
import { Button, Hex, style, Tag, Tooltip } from '@tempoxyz/ds'
import { Clock } from '@tempoxyz/ds/icons'
import type { Address as OxAddress, Hex as OxHex } from 'ox'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { InfoCard } from '#comps/InfoCard'
import { FormattedTimestamp, useTimeFormat } from '#comps/TimeFormat'
import { link, linkHover } from '#styles/explorer'

export function TxTransactionCard(
	props: TxTransactionCard.Props,
): React.JSX.Element {
	const { hash, status, error, blockNumber, timestamp, from, to, className } =
		props
	const { timeFormat, cycleTimeFormat } = useTimeFormat()
	return (
		<InfoCard
			title={<InfoCard.Title>Transaction</InfoCard.Title>}
			action={
				<Tag intent={status === 'success' ? 'positive' : 'negative'}>
					<Tag.Dot />
					{status === 'success' ? 'Confirmed' : 'Failed'}
				</Tag>
			}
			className={className}
			sections={[
				...(status === 'reverted' && error
					? [
							{
								label: 'Error',
								value: <span {...styles.error()}>{error}</span>,
							},
						]
					: []),
				{
					label: 'Hash',
					value: (
						<Hex.Root value={hash}>
							<Hex.Text />
							<Hex.Copy aria-label="Copy transaction hash" />
						</Hex.Root>
					),
				},
				{
					label: 'Block',
					value: (
						<Link
							to="/block/$id"
							params={{ id: String(blockNumber) }}
							{...cx(styles.number(), link(), linkHover())}
						>
							{blockNumber.toLocaleString('en-US')}
						</Link>
					),
				},
				{
					label: 'Time',
					value: (
						<span {...styles.time()}>
							<FormattedTimestamp
								timestamp={timestamp}
								format={timeFormat}
								className={styles.number().className}
							/>
							<Tooltip.Root>
								<Tooltip.Trigger
									render={
										<Button
											aria-label="Change time format"
											onClick={cycleTimeFormat}
											shape="icon"
											size="small"
											variant="text"
											{...styles.inlineButton()}
										/>
									}
								>
									<Clock />
								</Tooltip.Trigger>
								<Tooltip.Popup>Change time format</Tooltip.Popup>
							</Tooltip.Root>
						</span>
					),
				},
				{
					label: 'From',
					value: <Address address={from} align="end" />,
				},
				{
					label: 'To',
					value: to ? (
						<Address address={to} align="end" />
					) : (
						<span {...styles.secondary()}>Contract creation</span>
					),
				},
			]}
			footer={
				// Replaying the transaction on the state of its parent block is the
				// fastest way to see why it failed; `tx` alone prefills the simulator.
				<div {...styles.actions()}>
					<Button.Link
						render={<Link to="/receipt/$hash" params={{ hash }} />}
						size="small"
						variant="secondary"
						{...styles.action()}
					>
						View receipt
					</Button.Link>
					<Button.Link
						render={
							<Link
								to="/simulate"
								search={{ tx: hash }}
								title="Replay this transaction against the state of its parent block"
							/>
						}
						size="small"
						variant="secondary"
						{...styles.action()}
					>
						{status === 'reverted' ? 'Debug transaction' : 'Simulate'}
					</Button.Link>
				</div>
			}
		/>
	)
}

export declare namespace TxTransactionCard {
	type Props = {
		hash: OxHex.Hex
		status: 'success' | 'reverted'
		error?: string | undefined
		blockNumber: bigint
		timestamp: bigint
		from: OxAddress.Address
		to: OxAddress.Address | null
		className?: string
	}
}

namespace styles {
	export const error = style({
		color: 'foreground',
		textAlign: 'right',
		typography: 'copy.14',
	})

	export const number = style({ fontVariantNumeric: 'tabular-nums !custom' })

	export const time = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
	})

	// Negative margins let the 32px icon button sit in a 20px text row without
	// growing it.
	export const inlineButton = style({
		flexShrink: '0 !custom',
		marginBlock: '-6px !custom',
		marginRight: '-8px !custom',
	})

	export const secondary = style({ color: 'gray.900' })

	export const actions = style({
		display: 'flex',
		gap: '8',
		width: '100% !custom',
		'@media print': { display: 'none' },
	})

	// Button.Link leaves its flex sizing unset; the two actions share the row.
	export const action = style({ flex: '1 !custom' })
}
