import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import type * as React from 'react'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import { PriceFormatter } from '#lib/formatting'
import { useMediaQuery } from '#lib/hooks'
import { propAmmStatus, statusIntent, statusLabels } from '#lib/markets'
import type { PropAmmPool } from '#lib/propamm'
import {
	propAmmPoolsQueryOptions,
	propAmmTradesQueryOptions,
} from '#lib/queries/propamm'

const usd = (value: number) => PriceFormatter.format(value, { format: 'short' })
const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const price = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 4,
	maximumFractionDigits: 4,
})

/**
 * PropAMM pools trading the same two tokens as a DEX pair, in either order.
 * Renders nothing until a pool is known to exist, so the pair page is
 * unchanged for pairs PropAMM doesn't serve.
 */
export function PropAmmPairPools(
	props: PropAmmPairPools.Props,
): React.JSX.Element | null {
	const tokens = [props.a.toLowerCase(), props.b.toLowerCase()]
	const pools = useQuery(propAmmPoolsQueryOptions())
	const trades = useQuery(propAmmTradesQueryOptions())
	const isMobile = useMediaQuery('(max-width: 799px)')
	const matches = (pools.data?.pools ?? []).filter(
		(pool) =>
			tokens.includes(pool.base.address.toLowerCase()) &&
			tokens.includes(pool.quote.address.toLowerCase()) &&
			pool.base.address.toLowerCase() !== pool.quote.address.toLowerCase(),
	)
	if (matches.length === 0) return null
	const volume = trades.data?.totals
	const volumeFailed = trades.isError && !trades.data

	return (
		<Sections
			mode={isMobile ? 'stacked' : 'tabs'}
			sections={[
				{
					title: 'PropAMM',
					totalItems: matches.length,
					itemsLabel: 'pools',
					autoCollapse: false,
					content: (
						<DataGrid
							columns={{
								stacked: [
									{ label: 'Pool', align: 'start', width: '1fr' },
									{ label: 'Inventory', align: 'end', width: 'max-content' },
								],
								tabs: [
									{
										label: 'Pool',
										align: 'start',
										width: '2fr',
										minWidth: 200,
									},
									{ label: 'Price', align: 'end', width: '1fr', minWidth: 112 },
									{
										label: (
											<span title="Base and quote held, in US dollars. Pairs on one v2 venue share its balances.">
												Inventory
											</span>
										),
										align: 'end',
										width: '1fr',
										minWidth: 140,
									},
									{
										// DataGrid lowercases string labels.
										label: <span>1D vol</span>,
										align: 'end',
										width: '1fr',
										minWidth: 96,
									},
									{
										label: <span>30D vol</span>,
										align: 'end',
										width: '1fr',
										minWidth: 96,
									},
									{ label: 'State', align: 'end', width: '1fr', minWidth: 112 },
								],
							}}
							items={(mode) =>
								matches.map((pool) => {
									const poolVolume = volume
										? (volume[pool.key]?.volume ?? { day: 0, month: 0 })
										: undefined
									const volumeState = trades.isPending
										? 'loading'
										: volumeFailed
											? 'unknown'
											: 'known'
									return {
										key: pool.key,
										cells:
											mode === 'stacked'
												? [
														<PoolCell key="pool" pool={pool} withState />,
														<UsdValue key="inventory" value={pool.inventory} />,
													]
												: [
														<PoolCell key="pool" pool={pool} />,
														pool.price === null ? (
															<span key="price" className="text-tertiary">
																—
															</span>
														) : (
															<span
																key="price"
																className="tabular-nums text-secondary whitespace-nowrap"
															>
																{price.format(pool.price)}{' '}
																<span className="text-tertiary">
																	{pool.quote.symbol}
																</span>
															</span>
														),
														<Inventory key="inventory" pool={pool} />,
														<Volume
															key="day"
															state={volumeState}
															value={poolVolume?.day}
														/>,
														<Volume
															key="month"
															state={volumeState}
															value={poolVolume?.month}
														/>,
														<StateIndicator key="state" pool={pool} />,
													],
										link: {
											href: `/address/${pool.address}`,
											title: `${pool.base.symbol}/${pool.quote.symbol} pool`,
										},
									}
								})
							}
							totalItems={matches.length}
							page={1}
							itemsPerPage={matches.length}
							itemsLabel="pools"
							pagination="simple"
							showSimpleCount={false}
						/>
					),
				},
			]}
		/>
	)
}

export declare namespace PropAmmPairPools {
	type Props = {
		/** The pair's two tokens, in either order. */
		a: Address
		b: Address
	}
}

function PoolCell(props: {
	pool: PropAmmPool
	withState?: boolean
}): React.JSX.Element {
	const { base, quote, version } = props.pool
	return (
		<div className="flex items-center gap-2.5 min-w-0">
			<span className="inline-flex shrink-0 items-center">
				<TokenIcon
					address={base.address}
					name={base.symbol}
					className="size-5 ring-2 ring-card relative z-1"
				/>
				<TokenIcon
					address={quote.address}
					name={quote.symbol}
					className="size-5 -ml-1.5 ring-2 ring-card"
				/>
			</span>
			<span className="flex flex-col min-w-0">
				<span className="truncate font-medium text-primary">
					{base.symbol}
					<span className="text-tertiary"> / </span>
					{quote.symbol}
				</span>
				<span className="flex items-center gap-1.5 label-12 text-tertiary truncate">
					{version}
					{props.withState && (
						<>
							<span aria-hidden="true">·</span>
							<StateIndicator pool={props.pool} />
						</>
					)}
				</span>
			</span>
		</div>
	)
}

/** The pool's dollar inventory over its two balances. */
function Inventory(props: { pool: PropAmmPool }): React.JSX.Element {
	const { base, quote, baseBalance, quoteBalance, inventory } = props.pool
	const balance = (value: number | null, symbol: string) => (
		<span className="label-12 text-tertiary">
			{value === null ? '—' : amount.format(value)} {symbol}
		</span>
	)
	return (
		<span className="flex flex-col items-end gap-0.5 whitespace-nowrap">
			<UsdValue value={inventory} />
			{balance(baseBalance, base.symbol)}
			{balance(quoteBalance, quote.symbol)}
		</span>
	)
}

function UsdValue(props: { value: number | null }): React.JSX.Element {
	if (props.value === null) return <span className="text-tertiary">—</span>
	return <span className="tabular-nums text-primary">{usd(props.value)}</span>
}

function Volume(props: {
	state: 'loading' | 'known' | 'unknown'
	value: number | undefined
}): React.JSX.Element {
	if (props.state === 'loading')
		return (
			<span className="inline-block h-3.5 w-12 rounded-[4px] bg-distinct/70 animate-pulse" />
		)
	return (
		<UsdValue
			value={
				props.state === 'known' && props.value && props.value > 0
					? props.value
					: null
			}
		/>
	)
}

/** A dot in the state's intent and the pool's own word for it. */
function StateIndicator(props: { pool: PropAmmPool }): React.JSX.Element {
	const { status, detail } = propAmmStatus(props.pool.state)
	const intent = statusIntent[status]
	return (
		<span className="inline-flex items-center gap-1.5 whitespace-nowrap text-secondary">
			<span
				aria-hidden="true"
				className={cx(
					'size-2 rounded-full shrink-0',
					intent === 'positive' && 'bg-positive',
					intent === 'warning' && 'bg-warning',
					intent === 'neutral' && 'bg-tertiary',
				)}
			/>
			{detail ?? statusLabels[status]}
		</span>
	)
}
