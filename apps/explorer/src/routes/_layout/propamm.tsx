import { useQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { useMemo } from 'react'
import type * as React from 'react'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { RelativeTime } from '#comps/RelativeTime'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import type { DexPoolToken } from '#lib/dex-pools'
import { PriceFormatter } from '#lib/formatting'
import { useMediaQuery } from '#lib/hooks'
import {
	defaultPropAmmSearch,
	type PropAmmPool,
	type PropAmmRow,
	type PropAmmSearch,
	type PropAmmSort,
	type PropAmmState,
	type PropAmmTrade,
	propAmmSearchSchema,
	sortPropAmmPools,
	stateIntent,
	stateLabels,
} from '#lib/propamm'
import {
	propAmmPoolsQueryOptions,
	propAmmTradesQueryOptions,
} from '#lib/queries/propamm'
import ChevronDownIcon from '~icons/lucide/chevron-down'

export const Route = createFileRoute('/_layout/propamm')({
	component: PropAmmPage,
	validateSearch: propAmmSearchSchema,
	search: { middlewares: [stripSearchParams(defaultPropAmmSearch)] },
	head: () => ({ meta: [{ title: 'PropAMM – Tempo Explorer' }] }),
	// Cached data renders with the page; anything slower streams in after it,
	// so one slow read never holds the page. Prefetch caches failures too,
	// letting each section render its retry state.
	loader: async ({ context }) => {
		const reads = Promise.all([
			context.queryClient.prefetchQuery(propAmmPoolsQueryOptions()),
			context.queryClient.prefetchQuery(propAmmTradesQueryOptions()),
		])
		await Promise.race([
			reads,
			new Promise((resolve) => setTimeout(resolve, LOADER_WAIT)),
		])
	},
})

/** How long navigation waits for data before showing the page without it. */
const LOADER_WAIT = 300

const usd = (value: number) => PriceFormatter.format(value, { format: 'short' })
const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const price = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 4,
	maximumFractionDigits: 4,
})

function PropAmmPage(): React.JSX.Element {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const query = useQuery(propAmmPoolsQueryOptions())
	const tradesQuery = useQuery(propAmmTradesQueryOptions())
	const isMobile = useMediaQuery('(max-width: 799px)')
	const pools = query.data?.pools
	const trades = tradesQuery.data?.trades ?? []
	// Volume sums over pools, so it needs both reads: unknown when either
	// failed, loading while either is pending.
	const volumeTotals = tradesQuery.data?.totals
	const volumeState: VolumeState =
		volumeTotals && pools
			? 'known'
			: (tradesQuery.isError && !volumeTotals) || (query.isError && !pools)
				? 'unknown'
				: 'loading'

	// The headline volume needs only trades.
	const totalsState: VolumeState = volumeTotals
		? 'known'
		: tradesQuery.isError
			? 'unknown'
			: 'loading'

	const rows = useMemo(() => {
		const merged = (pools ?? []).map(
			(pool): PropAmmRow => ({
				...pool,
				volume: volumeTotals
					? (volumeTotals[pool.key]?.volume ?? { day: 0, month: 0 })
					: null,
			}),
		)
		return sortPropAmmPools(merged, search.sort, search.dir)
	}, [pools, volumeTotals, search.sort, search.dir])
	const poolsByKey = useMemo(
		() => new Map((pools ?? []).map((pool) => [pool.key, pool])),
		[pools],
	)
	const totals = useMemo(() => {
		const totals = { inventory: 0, partial: false, day: 0, month: 0 }
		// Volume sums every pool's trades, so a pool missing from the pools
		// read still counts.
		for (const total of Object.values(volumeTotals ?? {})) {
			totals.day += total.volume.day
			totals.month += total.volume.month
		}
		// A v2 venue's balances back all of its pairs, so each venue's token
		// balance counts once.
		const held = new Map<string, number>()
		for (const pool of rows) {
			if (pool.baseValue === null || pool.quoteValue === null)
				totals.partial = true
			if (pool.baseValue !== null)
				held.set(`${pool.address}-${pool.base.address}`, pool.baseValue)
			if (pool.quoteValue !== null)
				held.set(`${pool.address}-${pool.quote.address}`, pool.quoteValue)
		}
		for (const value of held.values()) totals.inventory += value
		// A pool that couldn't be read is missing from the totals.
		if (query.data && !query.data.complete) totals.partial = true
		return totals
	}, [rows, query.data, volumeTotals])

	function sortBy(sort: PropAmmSort) {
		const dir =
			search.sort === sort ? (search.dir === 'desc' ? 'asc' : 'desc') : 'desc'
		void navigate({
			search: (previous) => ({ ...previous, sort, dir }),
			replace: true,
			resetScroll: false,
		})
	}

	const sortable = (
		sort: PropAmmSort,
		label: string,
		title?: string,
	): DataGrid.Column => ({
		label: (
			<SortLabel
				sort={sort}
				label={label}
				title={title}
				search={search}
				onSort={sortBy}
			/>
		),
		align: 'end',
		width: '1fr',
		minWidth: 96,
	})

	return (
		<div className="flex flex-col gap-6 px-4 pt-8 sm:pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<div className="flex flex-col gap-3">
				<h1 className="text-[24px] sm:text-[32px] leading-tight tracking-[-0.02em] font-semibold text-primary">
					PropAMM
				</h1>
				<p className="copy-14 text-secondary max-w-[680px]">
					Permissioned pools where a market maker trades its own inventory with
					approved takers, at the maker’s posted quote or an oracle price.
				</p>
			</div>

			<section
				aria-label="Totals"
				className="grid grid-cols-3 rounded-body border border-card-border bg-card overflow-hidden"
			>
				<Stat
					label="Inventory"
					value={
						pools && `${totals.partial ? '≥' : ''}${usd(totals.inventory)}`
					}
				/>
				<Stat label="1D volume" value={statVolume(totalsState, totals.day)} />
				<Stat
					label="30D volume"
					value={statVolume(totalsState, totals.month)}
				/>
			</section>

			<Sections
				mode={isMobile ? 'stacked' : 'tabs'}
				activeSection={search.tab === 'trades' ? 1 : 0}
				onSectionChange={(index) =>
					void navigate({
						search: (previous) => ({
							...previous,
							tab: index === 1 ? 'trades' : 'pools',
						}),
						replace: true,
						resetScroll: false,
					})
				}
				sections={[
					{
						title: 'Pools',
						totalItems: pools ? rows.length : undefined,
						itemsLabel: 'pools',
						autoCollapse: false,
						content:
							query.isError && !pools ? (
								<LoadError
									message={query.error.message}
									retrying={query.isFetching}
									onRetry={() => void query.refetch()}
								/>
							) : (
								<DataGrid
									columns={{
										stacked: [
											{ label: 'Pool', align: 'start', width: '1fr' },
											{
												...sortable('inventory', 'Inventory'),
												width: 'max-content',
											},
										],
										tabs: [
											{
												label: 'Pool',
												align: 'start',
												width: '2fr',
												minWidth: 200,
											},
											{
												label: 'Price',
												align: 'end',
												width: '1fr',
												minWidth: 112,
											},
											sortable(
												'inventory',
												'Inventory',
												'Base and quote held, in US dollars. Pairs on one venue share its balances.',
											),
											sortable('day', '1D vol'),
											sortable('month', '30D vol'),
											{
												label: 'State',
												align: 'end',
												width: '1fr',
												minWidth: 112,
											},
										],
									}}
									items={(mode) =>
										rows.map((pool) => ({
											key: pool.key,
											cells:
												mode === 'stacked'
													? [
															<PoolCell key="pool" pool={pool} withState />,
															<UsdValue
																key="inventory"
																value={pool.inventory}
															/>,
														]
													: [
															<PoolCell key="pool" pool={pool} />,
															<PriceValue key="price" pool={pool} />,
															<UsdValue
																key="inventory"
																value={pool.inventory}
															/>,
															<Volume
																key="day"
																state={volumeState}
																value={pool.volume?.day}
															/>,
															<Volume
																key="month"
																state={volumeState}
																value={pool.volume?.month}
															/>,
															<StateIndicator key="state" state={pool.state} />,
														],
											link: {
												href: `/address/${pool.address}`,
												title: `${pool.base.symbol}/${pool.quote.symbol} pool`,
											},
										}))
									}
									totalItems={rows.length}
									page={1}
									loading={query.isPending}
									itemsPerPage={Math.max(rows.length, 4)}
									itemsLabel="pools"
									pagination="simple"
									showSimpleCount={false}
									emptyState="No propAMM pools on this network"
								/>
							),
					},
					{
						title: 'Trades',
						totalItems: tradesQuery.data && pools ? trades.length : undefined,
						itemsLabel: 'trades',
						autoCollapse: false,
						content:
							// Trades are labelled by their pool, so they need the pools read too.
							query.isError && !pools ? (
								<LoadError
									message={query.error.message}
									retrying={query.isFetching}
									onRetry={() => void query.refetch()}
								/>
							) : tradesQuery.isError && !tradesQuery.data ? (
								<LoadError
									message={tradesQuery.error.message}
									retrying={tradesQuery.isFetching}
									onRetry={() => void tradesQuery.refetch()}
								/>
							) : (
								<TradesGrid
									trades={trades}
									pools={poolsByKey}
									loading={!tradesQuery.data || !pools}
								/>
							),
					},
				]}
			/>
		</div>
	)
}

/** The latest trades of the last 30 days, newest first. */
function TradesGrid(props: {
	trades: PropAmmTrade[]
	pools: Map<string, PropAmmPool>
	loading: boolean
}): React.JSX.Element {
	const trades = props.trades.flatMap((trade) => {
		const pool = props.pools.get(trade.poolKey)
		return pool ? [{ trade, pool }] : []
	})
	return (
		<DataGrid
			columns={{
				stacked: [
					{ label: 'Trade', align: 'start', width: '1fr' },
					{ label: 'Value', align: 'end', width: 'max-content' },
				],
				tabs: [
					{ label: 'Time', align: 'start', width: 120 },
					{ label: 'Trade', align: 'start', width: '2fr', minWidth: 240 },
					{ label: 'Value', align: 'end', width: '1fr', minWidth: 96 },
					{ label: 'Amount', align: 'end', width: '1fr', minWidth: 140 },
					{ label: 'Price', align: 'end', width: '1fr', minWidth: 112 },
					{ label: 'Taker', align: 'end', width: '1fr', minWidth: 120 },
				],
			}}
			items={(mode) =>
				trades.map(({ trade, pool }) => ({
					key: trade.id,
					cells:
						mode === 'stacked'
							? [
									<div key="trade" className="flex flex-col gap-1 min-w-0">
										<TradeLabel trade={trade} pool={pool} />
										<RelativeTime
											timestamp={BigInt(trade.timestamp)}
											className="label-12 text-tertiary"
										/>
									</div>,
									<UsdValue key="value" value={trade.value} />,
								]
							: [
									<RelativeTime
										key="time"
										timestamp={BigInt(trade.timestamp)}
										className="text-secondary tabular-nums whitespace-nowrap"
									/>,
									<TradeLabel key="trade" trade={trade} pool={pool} />,
									<UsdValue key="value" value={trade.value} />,
									<span
										key="amount"
										className="tabular-nums text-primary whitespace-nowrap"
									>
										{amount.format(trade.baseAmount)}{' '}
										<span className="text-tertiary">{pool.base.symbol}</span>
									</span>,
									<span
										key="price"
										className="tabular-nums text-secondary whitespace-nowrap"
									>
										{trade.baseAmount > 0
											? price.format(trade.quoteAmount / trade.baseAmount)
											: '—'}
									</span>,
									<Address
										key="taker"
										address={trade.taker}
										align="end"
										chars={4}
									/>,
								],
					link: {
						href: `/tx/${trade.transactionHash}`,
						title: 'View transaction',
					},
				}))
			}
			totalItems={trades.length}
			page={1}
			loading={props.loading}
			itemsPerPage={Math.max(trades.length, 8)}
			itemsLabel="trades"
			pagination="simple"
			showSimpleCount={false}
			emptyState="No trades in the last 30 days"
		/>
	)
}

/** A taker buying base paid quote; selling it received quote. */
function TradeLabel(props: {
	trade: PropAmmTrade
	pool: PropAmmPool
}): React.JSX.Element {
	const buy = !props.trade.baseIn
	return (
		<span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
			<span
				className={cx('font-medium', buy ? 'text-positive' : 'text-negative')}
			>
				{buy ? 'Buy' : 'Sell'}
			</span>
			<TokenChip token={props.pool.base} />
			<span className="text-tertiary">{buy ? 'with' : 'for'}</span>
			<TokenChip token={props.pool.quote} />
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

function PoolCell(props: {
	pool: PropAmmPool
	withState?: boolean
}): React.JSX.Element {
	const { base, quote, version, state } = props.pool
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
							<StateIndicator state={state} />
						</>
					)}
				</span>
			</span>
		</div>
	)
}

/** A dot in the state's intent and its label (ds.tehq.dev StatusIndicator). */
function StateIndicator(props: { state: PropAmmState }): React.JSX.Element {
	const intent = stateIntent[props.state]
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
			{stateLabels[props.state]}
		</span>
	)
}

function PriceValue(props: { pool: PropAmmPool }): React.JSX.Element {
	if (props.pool.price === null) return <span className="text-tertiary">—</span>
	return (
		<span className="tabular-nums text-secondary whitespace-nowrap">
			{price.format(props.pool.price)}{' '}
			<span className="text-tertiary">{props.pool.quote.symbol}</span>
		</span>
	)
}

function UsdValue(props: { value: number | null }): React.JSX.Element {
	if (props.value === null) return <span className="text-tertiary">—</span>
	return <span className="tabular-nums text-primary">{usd(props.value)}</span>
}

type VolumeState = 'loading' | 'known' | 'unknown'

/** A stat's volume: undefined shows its loading bar. */
function statVolume(state: VolumeState, value: number): string | undefined {
	if (state === 'loading') return undefined
	return state === 'unknown' ? '—' : usd(value)
}

function Volume(props: {
	state: VolumeState
	value: number | undefined
}): React.JSX.Element {
	if (props.state === 'loading')
		return (
			<span className="inline-block h-3.5 w-12 rounded-[4px] bg-distinct/70 animate-pulse" />
		)
	if (props.state === 'unknown' || props.value === undefined)
		return <span className="text-tertiary">—</span>
	return (
		<span
			className={cx(
				'tabular-nums',
				props.value > 0 ? 'text-primary' : 'text-tertiary',
			)}
		>
			{props.value > 0 ? usd(props.value) : '—'}
		</span>
	)
}

function SortLabel(props: {
	sort: PropAmmSort
	label: string
	title?: string | undefined
	search: PropAmmSearch
	onSort: (sort: PropAmmSort) => void
}): React.JSX.Element {
	const active = props.search.sort === props.sort
	return (
		<button
			type="button"
			onClick={() => props.onSort(props.sort)}
			aria-label={`Sort by ${props.label}`}
			aria-pressed={active}
			title={props.title}
			className={cx(
				'cursor-pointer hover:text-primary',
				active && 'text-primary',
			)}
		>
			<span className="inline-flex items-center gap-[4px]">
				{/* Before the label, so its text lines up with the right-aligned values. */}
				{active && (
					<ChevronDownIcon
						aria-hidden="true"
						className={cx(
							'size-[12px] text-tertiary',
							props.search.dir === 'asc' && 'rotate-180',
						)}
					/>
				)}
				{props.label}
			</span>
		</button>
	)
}

function Stat(props: {
	label: string
	value: string | undefined
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-2 px-[18px] py-4 border-card-border border-dashed not-last:border-r">
			<div className="copy-13 text-tertiary">{props.label}</div>
			<div className="text-[20px] sm:text-[28px] leading-none tracking-[-0.02em] font-medium tabular-nums text-primary">
				{props.value ?? (
					<span className="inline-block h-[20px] sm:h-[28px] w-20 rounded-[4px] bg-distinct/70 animate-pulse align-top" />
				)}
			</div>
		</div>
	)
}

function LoadError(props: {
	message: string
	retrying: boolean
	onRetry: () => void
}): React.JSX.Element {
	return (
		<div
			role="alert"
			className="p-[18px] copy-14 text-secondary flex flex-col items-start gap-3"
		>
			<p>{props.message}</p>
			<button
				type="button"
				className="inline-flex items-center rounded-[7px] border border-card-border px-3 py-2 copy-13 text-secondary hover:text-primary cursor-pointer press-down disabled:opacity-50"
				disabled={props.retrying}
				onClick={props.onRetry}
			>
				{props.retrying ? 'Retrying…' : 'Try again'}
			</button>
		</div>
	)
}
