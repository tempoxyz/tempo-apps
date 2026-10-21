import { useQuery } from '@tanstack/react-query'
import { Amount, Button, style, Tag, Token, variants } from '@tempoxyz/ds'
import type * as React from 'react'
import type { Address as TokenAddress } from 'viem'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { RelativeTime } from '#comps/RelativeTime'
import type { DexPoolToken } from '#lib/dex-pools'
import type { DexSwap } from '#lib/dex-swaps'
import { dexSwapsQueryOptions } from '#lib/queries/dex-pools'

const LIVE_SCOPE = 'dex-swaps'

/** Recent swaps, or only those between a route's two ends. */
export function useDexSwaps(
	live: boolean,
	input: {
		path?: TokenAddress[] | undefined
		bases?: TokenAddress[] | undefined
		unverified?: boolean
	},
	enabled = true,
) {
	return useQuery({ ...dexSwapsQueryOptions(live, input), enabled })
}

export function DexSwapsGrid(props: DexSwapsGrid.Props): React.JSX.Element {
	const { swaps, loading, live, base } = props
	const label = (swap: DexSwap) =>
		base ? <SideLabel swap={swap} base={base} /> : <SwapLabel swap={swap} />
	return (
		<DataGrid
			liveScope={live ? LIVE_SCOPE : undefined}
			columns={{
				stacked: [
					{ label: base ? 'Type' : 'Swap', align: 'start', width: '1fr' },
					{ label: 'Value', align: 'end', width: 'max-content' },
				],
				tabs: [
					{ label: 'Time', align: 'start', width: 120 },
					{
						label: base ? 'Type' : 'Swap',
						align: 'start',
						width: '2fr',
					},
					{ label: 'Value', align: 'end', width: '1fr' },
					{ label: 'Sent', align: 'end', width: '1fr' },
					{ label: 'Received', align: 'end', width: '1fr' },
					{ label: 'Wallet', align: 'end', width: '1fr' },
				],
			}}
			items={(mode) =>
				swaps.map((swap) => ({
					key: swap.id,
					cells:
						mode === 'stacked'
							? [
									<div key="swap" {...styles.stackedSwap()}>
										{label(swap)}
										<RelativeTime
											timestamp={BigInt(swap.timestamp)}
											{...styles.stackedTime()}
										/>
									</div>,
									<Amount
										key="value"
										align="right"
										currency="USD"
										value={swap.amountIn}
									/>,
								]
							: [
									<RelativeTime
										key="time"
										timestamp={BigInt(swap.timestamp)}
										{...styles.time()}
									/>,
									<span key="swap">{label(swap)}</span>,
									<Amount
										key="value"
										align="right"
										currency="USD"
										value={swap.amountIn}
									/>,
									<TokenAmount
										key="sent"
										value={swap.amountIn}
										token={swap.from}
									/>,
									<TokenAmount
										key="received"
										value={swap.amountOut}
										token={swap.to}
									/>,
									<Address key="wallet" address={swap.taker} align="end" />,
								],
					link: {
						href: `/tx/${swap.transactionHash}`,
						title: 'View transaction',
					},
				}))
			}
			totalItems={swaps.length}
			page={1}
			loading={loading}
			itemsPerPage={Math.max(swaps.length, 8)}
			itemsLabel="swaps"
			pagination="simple"
			showSimpleCount={false}
			emptyState="No swaps"
		/>
	)
}

export declare namespace DexSwapsGrid {
	type Props = {
		swaps: DexSwap[]
		loading: boolean
		live: boolean
		/** Label each swap as buying or selling this token. */
		base?: TokenAddress | undefined
	}
}

/** Live feed toggle: a pressed button whose tag names the feed's state. */
export function LivePill(props: LivePill.Props): React.JSX.Element {
	const { live, onToggle } = props
	return (
		<Button
			aria-pressed={live}
			onClick={onToggle}
			title={live ? 'Pause live updates' : 'Resume live updates'}
			size="small"
			variant="secondary"
		>
			<Tag intent={live ? 'positive' : 'neutral'} variant="plain">
				<Tag.Dot />
				{live ? 'Live' : 'Paused'}
			</Tag>
		</Button>
	)
}

export declare namespace LivePill {
	type Props = { live: boolean; onToggle: () => void }
}

function SwapLabel(props: { swap: DexSwap }): React.JSX.Element {
	const { from, to } = props.swap
	return (
		<span {...styles.label()}>
			<span {...styles.secondary()}>Swap</span>
			<TokenChip token={from} />
			<span {...styles.secondary()}>for</span>
			<TokenChip token={to} />
		</span>
	)
}

/** A taker buying the base filled asks; selling it filled bids. */
function SideLabel(props: {
	swap: DexSwap
	base: TokenAddress
}): React.JSX.Element {
	const { from, to } = props.swap
	const buy = to.address === props.base
	return (
		<span {...styles.label()}>
			<span {...styles.side({ buy })}>{buy ? 'Buy' : 'Sell'}</span>
			<TokenChip token={buy ? to : from} />
			<span {...styles.secondary()}>{buy ? 'with' : 'for'}</span>
			<TokenChip token={buy ? from : to} />
		</span>
	)
}

function TokenChip(props: { token: DexPoolToken }): React.JSX.Element {
	return (
		<span {...styles.chip()}>
			<Token address={props.token.address} size="small" />
			{props.token.symbol}
		</span>
	)
}

/** Two decimals down the column; a sub-cent amount keeps two significant digits. */
function TokenAmount(props: {
	value: number
	token: DexPoolToken
}): React.JSX.Element {
	const { token, value } = props
	return (
		<Amount
			align="right"
			symbol={token.symbol}
			value={
				value > 0 && value < 0.01 ? value.toPrecision(2) : value.toFixed(2)
			}
			{...styles.nowrap()}
		/>
	)
}

namespace styles {
	export const stackedSwap = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0 !custom',
	})

	export const stackedTime = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const time = style({
		color: 'gray.900',
		fontVariantNumeric: 'tabular-nums',
		whiteSpace: 'nowrap',
	})

	export const nowrap = style({ whiteSpace: 'nowrap' })

	export const secondary = style({ color: 'gray.900' })

	export const label = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
		minWidth: '0 !custom',
		whiteSpace: 'nowrap',
	})

	export const side = variants({
		base: { typography: 'copy.14.strong' },
		defaultVariants: { buy: true },
		variants: {
			buy: {
				true: { color: 'green.900' },
				false: { color: 'red.900' },
			},
		},
	})

	export const chip = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'inline-flex',
		gap: '4',
		typography: 'copy.14.strong',
	})
}
