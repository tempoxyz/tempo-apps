import type { Address as TokenAddress } from 'viem'
import { useQuery } from '@tanstack/react-query'
import type * as React from 'react'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { RelativeTime } from '#comps/RelativeTime'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import type { DexPoolToken } from '#lib/dex-pools'
import type { DexSwap } from '#lib/dex-swaps'
import { PriceFormatter } from '#lib/formatting'
import { dexSwapsQueryOptions } from '#lib/queries/dex-pools'
import Play from '~icons/lucide/play'

const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
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
						minWidth: 240,
					},
					{ label: 'Value', align: 'end', width: '1fr', minWidth: 96 },
					{ label: 'Sent', align: 'end', width: '1fr', minWidth: 140 },
					{ label: 'Received', align: 'end', width: '1fr', minWidth: 140 },
					{ label: 'Wallet', align: 'end', width: '1fr', minWidth: 120 },
				],
			}}
			items={(mode) =>
				swaps.map((swap) => ({
					key: swap.id,
					cells:
						mode === 'stacked'
							? [
									<div key="swap" className="flex flex-col gap-1 min-w-0">
										{label(swap)}
										<RelativeTime
											timestamp={BigInt(swap.timestamp)}
											className="label-12 text-tertiary"
										/>
									</div>,
									<span key="value" className="tabular-nums text-primary">
										{PriceFormatter.format(swap.amountIn)}
									</span>,
								]
							: [
									<RelativeTime
										key="time"
										timestamp={BigInt(swap.timestamp)}
										className="text-secondary tabular-nums whitespace-nowrap"
									/>,
									<span key="swap">{label(swap)}</span>,
									<span key="value" className="tabular-nums text-primary">
										{PriceFormatter.format(swap.amountIn)}
									</span>,
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
									<Address
										key="wallet"
										address={swap.taker}
										align="end"
										chars={4}
									/>,
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

export function LivePill(props: LivePill.Props): React.JSX.Element {
	const { live, onToggle } = props
	return (
		<button
			type="button"
			onClick={onToggle}
			className={cx(
				'flex items-center gap-[4px] px-[6px] py-[2px] rounded-[4px] label-12 font-medium press-down cursor-pointer',
				live
					? 'bg-positive/10 text-positive hover:bg-positive/20'
					: 'bg-base-alt text-tertiary hover:bg-base-alt/80',
			)}
			title={live ? 'Pause live updates' : 'Resume live updates'}
		>
			{live ? (
				<>
					<span className="relative flex size-2">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
						<span className="relative inline-flex rounded-full size-2 bg-positive" />
					</span>
					<span>Live</span>
				</>
			) : (
				<>
					<Play className="size-3" />
					<span>Paused</span>
				</>
			)}
		</button>
	)
}

export declare namespace LivePill {
	type Props = { live: boolean; onToggle: () => void }
}

function SwapLabel(props: { swap: DexSwap }): React.JSX.Element {
	const { from, to } = props.swap
	return (
		<span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
			<span className="text-tertiary">Swap</span>
			<TokenChip token={from} />
			<span className="text-tertiary">for</span>
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
		<span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
			<span
				className={cx('font-medium', buy ? 'text-positive' : 'text-negative')}
			>
				{buy ? 'Buy' : 'Sell'}
			</span>
			<TokenChip token={buy ? to : from} />
			<span className="text-tertiary">{buy ? 'with' : 'for'}</span>
			<TokenChip token={buy ? from : to} />
		</span>
	)
}

function TokenChip(props: { token: DexPoolToken }): React.JSX.Element {
	return (
		<span className="inline-flex items-center gap-1.5 font-medium text-primary">
			<TokenIcon
				address={props.token.address}
				name={props.token.symbol}
				className="size-4"
			/>
			{props.token.symbol}
		</span>
	)
}

function TokenAmount(props: {
	value: number
	token: DexPoolToken
}): React.JSX.Element {
	return (
		<span className="tabular-nums text-primary whitespace-nowrap">
			{props.value > 0 && props.value < 0.01
				? '<0.01'
				: amount.format(props.value)}{' '}
			<span className="text-tertiary">{props.token.symbol}</span>
		</span>
	)
}
