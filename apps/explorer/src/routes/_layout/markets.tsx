import { useQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { useMemo } from 'react'
import type * as React from 'react'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { SegmentedControl } from '#comps/PanelToolbar'
import { RelativeTime } from '#comps/RelativeTime'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import type { DexPoolToken } from '#lib/dex-pools'
import { PriceFormatter } from '#lib/formatting'
import { useMediaQuery } from '#lib/hooks'
import {
	defaultMarketsSearch,
	dexRows,
	dexTrade,
	type MarketRow,
	type MarketSort,
	type MarketStatus,
	type MarketTotal,
	type MarketTrade,
	type MarketsSearch,
	marketHref,
	marketsSearchSchema,
	marketTotals,
	mergeTrades,
	propAmmRows,
	propAmmTrade,
	sortMarkets,
	statusIntent,
	statusLabels,
	venueLabels,
	venuesOf,
} from '#lib/markets'
import {
	dexPoolsQueryOptions,
	dexSwapsQueryOptions,
} from '#lib/queries/dex-pools'
import {
	propAmmPoolsQueryOptions,
	propAmmTradesQueryOptions,
} from '#lib/queries/propamm'

export const Route = createFileRoute('/_layout/markets')({
	component: MarketsPage,
	validateSearch: marketsSearchSchema,
	search: { middlewares: [stripSearchParams(defaultMarketsSearch)] },
	head: () => ({ meta: [{ title: 'Markets – Tempo Explorer' }] }),
	// Cached data renders with the page; anything slower streams in after it,
	// so one slow venue never holds the page. Prefetch caches failures too,
	// letting each venue render its retry state.
	loader: async ({ context }) => {
		const reads = Promise.all([
			context.queryClient.prefetchQuery(dexPoolsQueryOptions()),
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

const venueOptions = [
	{ value: 'all', label: 'All' },
	{ value: 'dex', label: venueLabels.dex },
	{ value: 'propamm', label: venueLabels.propamm },
] as const

/** Compact above $1K; cents below, so small amounts line up. */
const cents = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
})
const usd = (value: number) =>
	value < 1000
		? cents.format(value)
		: PriceFormatter.format(value, { format: 'short' })
const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const price = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 4,
	maximumFractionDigits: 4,
})
const bps = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

function MarketsPage(): React.JSX.Element {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const isMobile = useMediaQuery('(max-width: 799px)')
	const venues = venuesOf(search.venue)
	const showDex = venues.includes('dex')
	const showPropAmm = venues.includes('propamm')

	const dexQuery = useQuery(dexPoolsQueryOptions())
	const propAmmQuery = useQuery(propAmmPoolsQueryOptions())
	const propAmmTradesQuery = useQuery(propAmmTradesQueryOptions())
	// Swaps poll only while their list is on screen. The server applies the
	// verified filter so spam can't crowd the feed.
	const swapsVisible = showDex && (isMobile || search.tab === 'trades')
	const swapsQuery = useQuery({
		...dexSwapsQueryOptions(swapsVisible, { unverified: search.unverified }),
		enabled: swapsVisible,
	})

	const dexPools = useMemo(
		() =>
			dexQuery.data?.pools.filter(
				(pool) =>
					search.unverified || (pool.base.verified && pool.quote.verified),
			),
		[dexQuery.data, search.unverified],
	)
	const propAmmPools = propAmmQuery.data?.pools
	const volumeTotals = propAmmTradesQuery.data?.totals

	const dexFailed = dexQuery.isError && !dexQuery.data
	const propAmmFailed = propAmmQuery.isError && !propAmmQuery.data
	const propAmmTradesFailed =
		propAmmTradesQuery.isError && !propAmmTradesQuery.data
	const swapsFailed = swapsQuery.isError && !swapsQuery.data

	const totals = useMemo(
		() =>
			marketTotals({
				venues,
				dex: { data: dexPools, failed: dexFailed },
				propAmm: { data: propAmmQuery.data, failed: propAmmFailed },
				propAmmTrades: { data: volumeTotals, failed: propAmmTradesFailed },
			}),
		[
			dexPools,
			dexFailed,
			propAmmQuery.data,
			propAmmFailed,
			volumeTotals,
			propAmmTradesFailed,
			venues,
		],
	)

	const rows = useMemo(
		() =>
			sortMarkets(
				[
					...(showDex ? dexRows(dexPools ?? []) : []),
					...(showPropAmm
						? propAmmRows(
								propAmmPools ?? [],
								propAmmTradesFailed ? undefined : volumeTotals,
							)
						: []),
				],
				search.sort,
				search.dir,
			),
		[
			showDex,
			showPropAmm,
			dexPools,
			propAmmPools,
			volumeTotals,
			propAmmTradesFailed,
			search.sort,
			search.dir,
		],
	)

	const trades = useMemo(() => {
		const poolsByKey = new Map(
			(propAmmPools ?? []).map((pool) => [pool.key, pool]),
		)
		return mergeTrades(
			showDex
				? (swapsQuery.data ?? []).map((swap) =>
						dexTrade(swap, dexQuery.data?.pools),
					)
				: [],
			showPropAmm
				? (propAmmTradesQuery.data?.trades ?? []).flatMap((trade) => {
						const row = propAmmTrade(trade, poolsByKey)
						return row ? [row] : []
					})
				: [],
		)
	}, [
		showDex,
		showPropAmm,
		swapsQuery.data,
		dexQuery.data,
		propAmmPools,
		propAmmTradesQuery.data,
	])

	function setSearch(next: Partial<MarketsSearch>) {
		void navigate({
			search: (previous) => ({ ...previous, ...next }),
			replace: true,
			resetScroll: false,
		})
	}

	function sortBy(sort: MarketSort) {
		const dir =
			search.sort === sort
				? search.dir === 'desc'
					? 'asc'
					: 'desc'
				: sort === 'spread'
					? 'asc'
					: 'desc'
		setSearch({ sort, dir })
	}

	const sortable = (
		sort: MarketSort,
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
		sortDirection: search.sort === sort ? search.dir : undefined,
	})

	const pairsPending =
		(showDex && dexQuery.isPending) || (showPropAmm && propAmmQuery.isPending)
	const volumePending =
		showPropAmm && propAmmTradesQuery.isPending && !propAmmTradesFailed
	// Trades need their venue's labels: DEX books for buy or sell, propAMM pools
	// for the pair.
	const tradesPending =
		(showDex && (swapsQuery.isPending || dexQuery.isPending)) ||
		(showPropAmm &&
			(propAmmTradesQuery.isPending ||
				(propAmmQuery.isPending && !propAmmFailed)))

	const pairsErrors = [
		showDex && dexFailed && loadError('Stablecoin DEX pairs', dexQuery),
		showPropAmm && propAmmFailed && loadError('PropAMM pools', propAmmQuery),
		showPropAmm &&
			propAmmTradesFailed &&
			!propAmmFailed &&
			loadError('PropAMM volume', propAmmTradesQuery),
	].filter((error) => error !== false)
	const tradesErrors = [
		showDex && swapsFailed && loadError('Stablecoin DEX swaps', swapsQuery),
		showPropAmm &&
			propAmmTradesFailed &&
			loadError('PropAMM trades', propAmmTradesQuery),
		showPropAmm &&
			propAmmFailed &&
			!propAmmTradesFailed &&
			loadError('PropAMM pools', propAmmQuery),
	].filter((error) => error !== false)

	const verifiedToggle = showDex && (
		<VerifiedToggle
			checked={!search.unverified}
			onChange={(checked) => setSearch({ unverified: !checked })}
		/>
	)

	return (
		<div className="flex flex-col gap-6 px-4 pt-8 sm:pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<h1 className="text-[24px] sm:text-[32px] leading-tight tracking-[-0.02em] font-semibold text-primary">
					Markets
				</h1>
				<SegmentedControl
					value={search.venue}
					options={venueOptions}
					onChange={(venue) => setSearch({ venue })}
				/>
			</div>

			<section
				aria-label="Totals"
				className="grid grid-cols-3 rounded-body border border-card-border bg-card overflow-hidden"
			>
				<Stat label="Liquidity" total={totals.liquidity} />
				<Stat label="1D volume" total={totals.day} />
				<Stat label="30D volume" total={totals.month} />
			</section>

			<Sections
				mode={isMobile ? 'stacked' : 'tabs'}
				activeSection={search.tab === 'trades' ? 1 : 0}
				onSectionChange={(index) =>
					setSearch({ tab: index === 1 ? 'trades' : 'pairs' })
				}
				sections={[
					{
						title: 'Pairs',
						totalItems: pairsPending ? undefined : rows.length,
						itemsLabel: 'pairs',
						autoCollapse: false,
						contextual: verifiedToggle,
						content: (
							<>
								{pairsErrors}
								{(rows.length > 0 || pairsErrors.length === 0) && (
									<DataGrid
										columns={{
											stacked: [
												{ label: 'Pair', align: 'start', width: '1fr' },
												{
													...sortable('liquidity', 'Liquidity'),
													width: 'max-content',
												},
											],
											tabs: [
												{
													label: 'Pair',
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
													'liquidity',
													'Liquidity',
													'In US dollars. DEX: resting orders at par. PropAMM: the pool’s inventory, which pairs on one v2 venue share.',
												),
												...(showDex ? [sortable('spread', 'Spread')] : []),
												sortable('day', '1D vol'),
												sortable('month', '30D vol'),
											],
										}}
										items={(mode) =>
											rows.map((row) => {
												const volumeLoading =
													volumePending && row.venue === 'propamm'
												return {
													key: row.key,
													cells:
														mode === 'stacked'
															? [
																	<PairCell key="pair" row={row} />,
																	<Liquidity key="liquidity" row={row} />,
																]
															: [
																	<PairCell key="pair" row={row} />,
																	<PriceValue
																		key="price"
																		value={row.price}
																		quote={row.quote}
																	/>,
																	<Liquidity key="liquidity" row={row} />,
																	...(showDex
																		? [
																				<Spread
																					key="spread"
																					value={row.spread}
																				/>,
																			]
																		: []),
																	<Volume
																		key="day"
																		loading={volumeLoading}
																		value={row.volume?.day}
																	/>,
																	<Volume
																		key="month"
																		loading={volumeLoading}
																		value={row.volume?.month}
																	/>,
																],
													link: {
														href: marketHref(row.link),
														title: `${row.base.symbol} / ${row.quote.symbol}`,
													},
												}
											})
										}
										totalItems={rows.length}
										page={1}
										loading={rows.length === 0 && pairsPending}
										itemsPerPage={Math.max(rows.length, 5)}
										itemsLabel="pairs"
										pagination="simple"
										showSimpleCount={false}
										emptyState="No pairs"
									/>
								)}
							</>
						),
					},
					{
						title: 'Trades',
						totalItems: tradesPending ? undefined : trades.length,
						itemsLabel: 'trades',
						autoCollapse: false,
						contextual: verifiedToggle,
						content: (
							<>
								{tradesErrors}
								{(trades.length > 0 || tradesErrors.length === 0) && (
									<TradesGrid
										trades={trades}
										showVenue={venues.length > 1}
										loading={trades.length === 0 && tradesPending}
									/>
								)}
							</>
						),
					},
				]}
			/>
		</div>
	)
}

/** Both venues' latest trades, newest first. */
function TradesGrid(props: {
	trades: MarketTrade[]
	showVenue: boolean
	loading: boolean
}): React.JSX.Element {
	const { trades, showVenue } = props
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
				trades.map((trade) => {
					const venue = showVenue && (
						<span className="label-12 text-tertiary">
							{venueLabels[trade.venue]}
						</span>
					)
					return {
						key: trade.id,
						cells:
							mode === 'stacked'
								? [
										<div key="trade" className="flex flex-col gap-1 min-w-0">
											<TradeLabel trade={trade} />
											<span className="flex items-center gap-1.5 label-12 text-tertiary whitespace-nowrap">
												<RelativeTime timestamp={BigInt(trade.timestamp)} />
												{venue && <span aria-hidden="true">·</span>}
												{venue}
											</span>
										</div>,
										<UsdValue key="value" value={trade.value} />,
									]
								: [
										<RelativeTime
											key="time"
											timestamp={BigInt(trade.timestamp)}
											className="text-secondary tabular-nums whitespace-nowrap"
										/>,
										<div key="trade" className="flex flex-col gap-1 min-w-0">
											<TradeLabel trade={trade} />
											{venue}
										</div>,
										<UsdValue key="value" value={trade.value} />,
										<span
											key="amount"
											className="tabular-nums text-primary whitespace-nowrap"
										>
											{trade.baseAmount > 0 && trade.baseAmount < 0.01
												? '<0.01'
												: amount.format(trade.baseAmount)}{' '}
											<span className="text-tertiary">{trade.base.symbol}</span>
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
					}
				})
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

/**
 * A taker buying base paid quote; selling it received quote. A DEX swap
 * routed through several books has no side.
 */
function TradeLabel(props: { trade: MarketTrade }): React.JSX.Element {
	const { side, base, quote } = props.trade
	return (
		<span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
			{side === null ? (
				<span className="text-tertiary">Swap</span>
			) : (
				<span
					className={cx(
						'font-medium',
						side === 'buy' ? 'text-positive' : 'text-negative',
					)}
				>
					{side === 'buy' ? 'Buy' : 'Sell'}
				</span>
			)}
			<TokenChip token={base} />
			<span className="text-tertiary">{side === 'buy' ? 'with' : 'for'}</span>
			<TokenChip token={quote} />
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

/** A pair, its venue and, unless it trades normally, its status. */
function PairCell(props: { row: MarketRow }): React.JSX.Element {
	const { base, quote, pool, status, statusDetail } = props.row
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
					{pool ? `${venueLabels.propamm} ${pool.version}` : 'Order book'}
					{status !== 'live' && (
						<>
							<span aria-hidden="true">·</span>
							<StatusIndicator status={status} detail={statusDetail} />
						</>
					)}
				</span>
			</span>
		</div>
	)
}

/** A dot in the status's intent and the venue's own word for it. */
function StatusIndicator(props: {
	status: MarketStatus
	detail: string | null
}): React.JSX.Element {
	const intent = statusIntent[props.status]
	return (
		<span
			className="inline-flex items-center gap-1.5 whitespace-nowrap text-secondary"
			title={props.detail ? statusLabels[props.status] : undefined}
		>
			<span
				aria-hidden="true"
				className={cx(
					'size-2 rounded-full shrink-0',
					intent === 'positive' && 'bg-positive',
					intent === 'warning' && 'bg-warning',
					intent === 'neutral' && 'bg-tertiary',
				)}
			/>
			{props.detail ?? statusLabels[props.status]}
		</span>
	)
}

function PriceValue(props: {
	value: number | null
	quote: DexPoolToken
}): React.JSX.Element {
	if (props.value === null) return <Dash />
	return (
		<span className="tabular-nums text-secondary whitespace-nowrap">
			{price.format(props.value)}{' '}
			<span className="text-tertiary">{props.quote.symbol}</span>
		</span>
	)
}

function Liquidity(props: { row: MarketRow }): React.JSX.Element {
	const { liquidity } = props.row
	if (!liquidity) return <Dash />
	return (
		<span className="tabular-nums text-primary">
			{liquidity.partial && '≥'}
			{usd(liquidity.value)}
		</span>
	)
}

function Spread(props: { value: number | null }): React.JSX.Element {
	if (props.value === null) return <Dash />
	return (
		<span className="tabular-nums text-secondary">
			{props.value < 0 ? 'Crossed' : `${bps.format(props.value)} bps`}
		</span>
	)
}

function Volume(props: {
	loading: boolean
	value: number | undefined
}): React.JSX.Element {
	if (props.loading)
		return (
			<span className="inline-block h-3.5 w-12 rounded-[4px] bg-distinct/70 animate-pulse" />
		)
	return (
		<UsdValue value={props.value && props.value > 0 ? props.value : null} />
	)
}

function UsdValue(props: { value: number | null }): React.JSX.Element {
	if (props.value === null) return <Dash />
	return <span className="tabular-nums text-primary">{usd(props.value)}</span>
}

function Dash(): React.JSX.Element {
	return <span className="text-tertiary">—</span>
}

function SortLabel(props: {
	sort: MarketSort
	label: string
	title?: string | undefined
	search: MarketsSearch
	onSort: (sort: MarketSort) => void
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
			{props.label}
		</button>
	)
}

function VerifiedToggle(props: {
	checked: boolean
	onChange: (checked: boolean) => void
}): React.JSX.Element {
	return (
		<label className="inline-flex items-center gap-2 label-12 text-secondary whitespace-nowrap cursor-pointer select-none">
			<input
				type="checkbox"
				checked={props.checked}
				onChange={(event) => props.onChange(event.target.checked)}
				className="accent-(--color-accent) cursor-pointer"
			/>
			Verified only
		</label>
	)
}

/** A headline total: a pulse while loading, ≥ for a lower bound. */
function Stat(props: { label: string; total: MarketTotal }): React.JSX.Element {
	const { total } = props
	return (
		<div className="flex flex-col gap-2 px-[18px] py-4 border-card-border border-dashed not-last:border-r">
			<div
				className="copy-13 text-tertiary"
				title={
					total?.partial
						? 'A lower bound: a venue or some of its reads are unavailable.'
						: undefined
				}
			>
				{props.label}
			</div>
			<div className="text-[20px] sm:text-[28px] leading-none tracking-[-0.02em] font-medium tabular-nums text-primary">
				{total === null ? (
					<span className="inline-block h-[20px] sm:h-[28px] w-20 rounded-[4px] bg-distinct/70 animate-pulse align-top" />
				) : total.unknown ? (
					'—'
				) : (
					`${total.partial ? '≥' : ''}${usd(total.value)}`
				)}
			</div>
		</div>
	)
}

/** A read that failed with nothing cached, and its retry. */
function loadError(
	label: string,
	query: {
		error: Error | null
		isFetching: boolean
		refetch: () => Promise<unknown>
	},
): React.JSX.Element {
	return (
		<div
			key={label}
			role="alert"
			className="p-[18px] copy-14 text-secondary flex flex-col items-start gap-3 not-last:border-b border-dashed border-card-border"
		>
			<p>
				<span className="text-primary">{label} unavailable.</span>{' '}
				{query.error?.message}
			</p>
			<button
				type="button"
				className="inline-flex items-center rounded-[7px] border border-card-border px-3 py-2 copy-13 text-secondary hover:text-primary cursor-pointer press-down disabled:opacity-50"
				disabled={query.isFetching}
				onClick={() => void query.refetch()}
			>
				{query.isFetching ? 'Retrying…' : 'Try again'}
			</button>
		</div>
	)
}
