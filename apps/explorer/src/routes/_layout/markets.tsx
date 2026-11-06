import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from '@tanstack/react-router'
import {
	Alert,
	Container,
	Empty,
	Grid,
	Inline,
	Skeleton,
	Stack,
	StatusIndicator,
	Surface,
	Switch,
	style,
	Table,
	Tabs,
	TokenLogo,
} from '@tempoxyz/ds'
import { useMemo } from 'react'
import type * as React from 'react'
import { Address } from '#comps/Address'
import { RelativeTime } from '#comps/RelativeTime'
import type { DexPoolToken } from '#lib/dex-pools'
import { PriceFormatter } from '#lib/formatting'
import { useRowLink } from '#lib/hooks'
import {
	defaultMarketsSearch,
	dexRows,
	dexTrade,
	type MarketLink,
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
	uniswapRows,
	uniswapTrade,
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
import {
	uniswapPoolsQueryOptions,
	uniswapTradesQueryOptions,
} from '#lib/queries/uniswap'

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
			context.queryClient.prefetchQuery(uniswapPoolsQueryOptions()),
			context.queryClient.prefetchQuery(uniswapTradesQueryOptions()),
		])
		await Promise.race([
			reads,
			new Promise((resolve) => setTimeout(resolve, LOADER_WAIT)),
		])
	},
})

/** How long navigation waits for data before showing the page without it. */
const LOADER_WAIT = 300

/** Placeholder rows while a list has nothing to show yet. */
const LOADING_ROWS = 5

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

namespace styles {
	export const page = style({
		boxSizing: 'border-box',
		// The layout centres its children, so the page claims the full width.
		width: '100% !custom',
		minWidth: '0',
		paddingBlockStart: '24',
		'@media (min-width: 768px)': { paddingBlockStart: '48' },
		paddingBlockEnd: '64',
		color: 'content.primary',
		typography: 'body.b2',
	})
	export const header = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '16',
		justifyContent: 'space-between',
		minWidth: '0',
	})
	export const title = style({
		color: 'content.primary',
		margin: '0',
		typography: 'heading.h2',
	})
	export const statLabel = style({
		color: 'content.secondary',
		margin: '0',
		typography: 'body.b2',
	})
	export const statValue = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums !custom',
		margin: '0',
		typography: 'heading.h2',
	})
	export const tabsBar = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
		justifyContent: 'space-between',
		minWidth: '0',
	})
	export const venues = style({ minWidth: '0', maxWidth: '100% !custom' })
	export const toggle = style({
		alignItems: 'center',
		color: 'content.secondary',
		cursor: 'pointer',
		display: 'inline-flex',
		gap: '8',
		typography: 'body.b2',
		whiteSpace: 'nowrap',
	})
	export const scroll = style({ overflowX: 'auto', minWidth: '0' })
	export const muted = style({ color: 'content.tertiary' })
	export const secondary = style({ color: 'content.secondary' })
	export const strong = style({ typography: 'body.b2Strong' })
	export const nowrap = style({ whiteSpace: 'nowrap' })
	export const pair = style({
		alignItems: 'center',
		display: 'inline-flex',
		flexShrink: '0 !custom',
		selectors: { '& > :not(:first-child)': { marginInlineStart: '-6' } },
	})
	export const subtitle = style({
		alignItems: 'center',
		display: 'flex',
		gap: '6',
		whiteSpace: 'nowrap',
	})
	export const link = style({
		color: 'inherit !custom',
		textDecoration: 'none !custom',
	})
	export const buy = style({
		color: 'content.positive',
		typography: 'body.b2Strong',
	})
	export const sell = style({
		color: 'content.negative',
		typography: 'body.b2Strong',
	})
	export const tabCount = style({
		color: 'content.tertiary',
		marginInlineStart: '6',
		fontVariantNumeric: 'tabular-nums !custom',
	})
	export const panel = style({ paddingBlockStart: '16' })
	/** Columns a phone leaves out, so the rest keep room to read. */
	export const wide = style({
		'@media (max-width: 639px)': { display: 'none !custom' },
	})
	/** What a phone shows in place of a hidden column. */
	export const narrow = style({
		display: 'none !custom',
		'@media (max-width: 639px)': { display: 'inline !custom' },
	})
	/** A phone gives the table more of its width. */
	export const card = style({
		'@media (max-width: 639px)': { paddingInline: '16' },
	})
}

function MarketsPage(): React.JSX.Element {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const venues = venuesOf(search.venue)
	const showDex = venues.includes('dex')
	const showPropAmm = venues.includes('propamm')
	const showUniswap = venues.includes('uniswap')

	const dexQuery = useQuery(dexPoolsQueryOptions())
	const propAmmQuery = useQuery(propAmmPoolsQueryOptions())
	const propAmmTradesQuery = useQuery(propAmmTradesQueryOptions())
	const uniswapQuery = useQuery(uniswapPoolsQueryOptions())
	const uniswapTradesQuery = useQuery(uniswapTradesQueryOptions())
	// Swaps poll only while their list is on screen. The server applies the
	// verified filter so spam can't crowd the feed.
	const swapsVisible = showDex && search.tab === 'trades'
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
	const uniswapFailed = uniswapQuery.isError && !uniswapQuery.data
	const uniswapTradesFailed =
		uniswapTradesQuery.isError && !uniswapTradesQuery.data

	const totals = useMemo(
		() =>
			marketTotals({
				venues,
				dex: { data: dexPools, failed: dexFailed },
				propAmm: { data: propAmmQuery.data, failed: propAmmFailed },
				propAmmTrades: { data: volumeTotals, failed: propAmmTradesFailed },
				uniswap: { data: uniswapQuery.data, failed: uniswapFailed },
			}),
		[
			uniswapQuery.data,
			uniswapFailed,
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
					...(showUniswap ? uniswapRows(uniswapQuery.data?.pools ?? []) : []),
				],
				search.sort,
				search.dir,
			),
		[
			showUniswap,
			uniswapQuery.data,
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
		const uniswapByKey = new Map(
			(uniswapQuery.data?.pools ?? []).map((pool) => [pool.key, pool]),
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
			showUniswap
				? (uniswapTradesQuery.data ?? []).flatMap((trade) => {
						const row = uniswapTrade(trade, uniswapByKey)
						return row ? [row] : []
					})
				: [],
		)
	}, [
		showUniswap,
		uniswapQuery.data,
		uniswapTradesQuery.data,
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

	const pairsPending =
		(showDex && dexQuery.isPending) ||
		(showPropAmm && propAmmQuery.isPending) ||
		(showUniswap && uniswapQuery.isPending)
	const volumePending =
		showPropAmm && propAmmTradesQuery.isPending && !propAmmTradesFailed
	// Trades need their venue's labels: DEX books for buy or sell, propAMM pools
	// for the pair.
	const tradesPending =
		(showDex && (swapsQuery.isPending || dexQuery.isPending)) ||
		(showPropAmm &&
			(propAmmTradesQuery.isPending ||
				(propAmmQuery.isPending && !propAmmFailed))) ||
		(showUniswap &&
			(uniswapTradesQuery.isPending ||
				(uniswapQuery.isPending && !uniswapFailed)))

	const pairsErrors: LoadErrorProps[] = [
		...(showDex && dexFailed
			? [errorProps('Stablecoin DEX pairs', dexQuery)]
			: []),
		...(showPropAmm && propAmmFailed
			? [errorProps('PropAMM pools', propAmmQuery)]
			: []),
		...(showPropAmm && propAmmTradesFailed && !propAmmFailed
			? [
					{
						...errorProps('PropAMM volume', propAmmTradesQuery),
						intent: 'warning' as const,
					},
				]
			: []),
		...(showUniswap && uniswapFailed
			? [errorProps('Uniswap v4 pools', uniswapQuery)]
			: []),
	]
	const tradesErrors: LoadErrorProps[] = [
		...(showDex && swapsFailed
			? [errorProps('Stablecoin DEX swaps', swapsQuery)]
			: []),
		...(showPropAmm && propAmmTradesFailed
			? [errorProps('PropAMM trades', propAmmTradesQuery)]
			: []),
		...(showPropAmm && propAmmFailed && !propAmmTradesFailed
			? [errorProps('PropAMM pools', propAmmQuery)]
			: []),
		...(showUniswap && uniswapTradesFailed
			? [errorProps('Uniswap v4 swaps', uniswapTradesQuery)]
			: []),
		...(showUniswap && uniswapFailed && !uniswapTradesFailed
			? [errorProps('Uniswap v4 pools', uniswapQuery)]
			: []),
	]

	return (
		<div {...styles.page()}>
			<Container size="wide">
				<Stack gap="32">
					<div {...styles.header()}>
						<h1 {...styles.title()}>Markets</h1>
						<Tabs.Root
							value={search.venue}
							onValueChange={(value) =>
								setSearch({ venue: value as MarketsSearch['venue'] })
							}
							{...styles.venues()}
						>
							<Tabs.List variant="pill" size="small" aria-label="Venue">
								<Tabs.Tab value="all">All</Tabs.Tab>
								<Tabs.Tab value="dex">{venueLabels.dex}</Tabs.Tab>
								<Tabs.Tab value="propamm">{venueLabels.propamm}</Tabs.Tab>
								<Tabs.Tab value="uniswap">{venueLabels.uniswap}</Tabs.Tab>
							</Tabs.List>
						</Tabs.Root>
					</div>

					<Grid fit="medium" gap="16" render={<section aria-label="Totals" />}>
						<Stat label="Liquidity" total={totals.liquidity} />
						<Stat label="1D volume" total={totals.day} />
						<Stat label="30D volume" total={totals.month} />
					</Grid>

					<Tabs.Root
						value={search.tab}
						onValueChange={(value) =>
							setSearch({ tab: value === 'trades' ? 'trades' : 'pairs' })
						}
					>
						<div {...styles.tabsBar()}>
							<Tabs.List aria-label="Markets data">
								<Tabs.Tab value="pairs">
									Pairs
									{!pairsPending && (
										<span {...styles.tabCount()}>{rows.length}</span>
									)}
								</Tabs.Tab>
								<Tabs.Tab value="trades">
									Trades
									{!tradesPending && (
										<span {...styles.tabCount()}>{trades.length}</span>
									)}
								</Tabs.Tab>
								<Tabs.Indicator />
							</Tabs.List>
							{showDex && (
								// biome-ignore lint/a11y/noLabelWithoutControl: Base UI's Switch renders its input inside the label.
								<label {...styles.toggle()}>
									<Switch
										size="small"
										checked={!search.unverified}
										onCheckedChange={(checked) =>
											setSearch({ unverified: !checked })
										}
									/>
									Verified only
								</label>
							)}
						</div>

						<Tabs.Panel value="pairs" {...styles.panel()}>
							<Surface size="medium" {...styles.card()}>
								<Stack gap="16">
									{pairsErrors.map((error) => (
										<LoadError key={error.label} {...error} />
									))}
									<PairsTable
										rows={rows}
										loading={rows.length === 0 && pairsPending}
										volumeLoading={volumePending}
										showSpread={showDex}
										hasErrors={pairsErrors.length > 0}
										search={search}
										onSort={sortBy}
									/>
								</Stack>
							</Surface>
						</Tabs.Panel>

						<Tabs.Panel value="trades" {...styles.panel()}>
							<Surface size="medium" {...styles.card()}>
								<Stack gap="16">
									{tradesErrors.map((error) => (
										<LoadError key={error.label} {...error} />
									))}
									<TradesTable
										trades={trades}
										showVenue={venues.length > 1}
										loading={trades.length === 0 && tradesPending}
										hasErrors={tradesErrors.length > 0}
									/>
								</Stack>
							</Surface>
						</Tabs.Panel>
					</Tabs.Root>
				</Stack>
			</Container>
		</div>
	)
}

function errorProps(
	label: string,
	query: {
		error: Error | null
		isFetching: boolean
		refetch: () => Promise<unknown>
	},
): LoadErrorProps {
	return {
		label,
		message: query.error?.message ?? 'Unavailable.',
		retrying: query.isFetching,
		onRetry: () => void query.refetch(),
	}
}

function PairsTable(props: PairsTableProps): React.JSX.Element | null {
	const {
		rows,
		loading,
		volumeLoading,
		showSpread,
		hasErrors,
		search,
		onSort,
	} = props
	const rowLink = useRowLink()
	if (!loading && rows.length === 0)
		return hasErrors ? null : <EmptyState title="No pairs" />

	const sortable = (
		sort: MarketSort,
		label: string,
		title?: string,
		wide = true,
	) => (
		<Table.HeaderCell
			justify="end"
			title={title}
			{...(wide ? styles.wide() : {})}
			aria-sort={
				search.sort === sort
					? search.dir === 'asc'
						? 'ascending'
						: 'descending'
					: undefined
			}
		>
			<Table.SortButton
				onClick={() => onSort(sort)}
				aria-label={`Sort by ${label}`}
			>
				{label}
			</Table.SortButton>
		</Table.HeaderCell>
	)

	const columns = showSpread ? 6 : 5
	return (
		<div {...styles.scroll()}>
			<Table interactive>
				<Table.Caption>
					Pairs on the Stablecoin DEX, PropAMM and Uniswap v4
				</Table.Caption>
				<Table.Head>
					<Table.Row>
						<Table.HeaderCell>Pair</Table.HeaderCell>
						<Table.HeaderCell justify="end" {...styles.wide()}>
							Price
						</Table.HeaderCell>
						{sortable(
							'liquidity',
							'Liquidity',
							'In US dollars. DEX: resting orders at par. PropAMM: the pool’s inventory, which pairs on one v2 venue share. Uniswap v4: what the pool’s positions hold at the current price.',
							false,
						)}
						{showSpread && sortable('spread', 'Spread')}
						{sortable('day', '1D vol')}
						{sortable('month', '30D vol')}
					</Table.Row>
				</Table.Head>
				<Table.Body>
					{rows.map((row) => {
						const rowVolumeLoading = volumeLoading && row.venue === 'propamm'
						return (
							<Table.Row key={row.key} {...rowLink(marketHref(row.link))}>
								<Table.Cell>
									<PairLabel row={row} />
								</Table.Cell>
								<Table.Cell justify="end" numeric {...styles.wide()}>
									<PriceValue value={row.price} quote={row.quote} />
								</Table.Cell>
								<Table.Cell justify="end" numeric>
									{row.liquidity ? (
										<span {...styles.nowrap()}>
											{row.liquidity.partial && '≥'}
											{usd(row.liquidity.value)}
										</span>
									) : (
										<Dash />
									)}
								</Table.Cell>
								{showSpread && (
									<Table.Cell justify="end" numeric {...styles.wide()}>
										<SpreadValue value={row.spread} />
									</Table.Cell>
								)}
								<Table.Cell justify="end" numeric {...styles.wide()}>
									<Volume loading={rowVolumeLoading} value={row.volume?.day} />
								</Table.Cell>
								<Table.Cell justify="end" numeric {...styles.wide()}>
									<Volume
										loading={rowVolumeLoading}
										value={row.volume?.month}
									/>
								</Table.Cell>
							</Table.Row>
						)
					})}
					{loading &&
						Array.from({ length: LOADING_ROWS }, (_, index) => (
							<LoadingRow key={index} columns={columns} />
						))}
				</Table.Body>
			</Table>
		</div>
	)
}

type PairsTableProps = {
	rows: MarketRow[]
	/** Nothing to show yet while a venue loads. */
	loading: boolean
	volumeLoading: boolean
	/** Spread is a DEX measure, shown while DEX pairs are in view. */
	showSpread: boolean
	/** A venue failed, so an empty list isn't the whole story. */
	hasErrors: boolean
	search: MarketsSearch
	onSort: (sort: MarketSort) => void
}

/** Both venues' latest trades, newest first. */
function TradesTable(props: TradesTableProps): React.JSX.Element | null {
	const { trades, showVenue, loading, hasErrors } = props
	const rowLink = useRowLink()
	if (!loading && trades.length === 0)
		return hasErrors ? null : (
			<EmptyState title="No trades in the last 30 days" />
		)

	return (
		<div {...styles.scroll()}>
			<Table interactive>
				<Table.Caption>
					Latest Stablecoin DEX swaps, PropAMM trades and Uniswap v4 swaps of
					the last 30 days
				</Table.Caption>
				<Table.Head>
					<Table.Row>
						<Table.HeaderCell {...styles.wide()}>Time</Table.HeaderCell>
						<Table.HeaderCell>Trade</Table.HeaderCell>
						<Table.HeaderCell justify="end">Value</Table.HeaderCell>
						<Table.HeaderCell justify="end" {...styles.wide()}>
							Amount
						</Table.HeaderCell>
						<Table.HeaderCell justify="end" {...styles.wide()}>
							Price
						</Table.HeaderCell>
						<Table.HeaderCell justify="end" {...styles.wide()}>
							Taker
						</Table.HeaderCell>
					</Table.Row>
				</Table.Head>
				<Table.Body>
					{trades.map((trade) => (
						<Table.Row
							key={trade.id}
							{...rowLink(`/tx/${trade.transactionHash}`)}
						>
							<Table.Cell muted {...styles.wide()}>
								<Link
									preload="intent"
									to="/tx/$hash"
									params={{ hash: trade.transactionHash }}
									title="View transaction"
									{...styles.link()}
								>
									<span {...styles.nowrap()}>
										<RelativeTime timestamp={BigInt(trade.timestamp)} />
									</span>
								</Link>
							</Table.Cell>
							<Table.Cell>
								<TradeLabel trade={trade} />
								<Table.Subtitle>
									{showVenue && venueLabels[trade.venue]}
									<span {...styles.narrow()}>
										{showVenue && <span aria-hidden="true"> · </span>}
										<RelativeTime timestamp={BigInt(trade.timestamp)} />
									</span>
								</Table.Subtitle>
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								{trade.value === null ? <Dash /> : usd(trade.value)}
							</Table.Cell>
							<Table.Cell justify="end" {...styles.wide()} numeric>
								<span {...styles.nowrap()}>
									{trade.baseAmount > 0 && trade.baseAmount < 0.01
										? '<0.01'
										: amount.format(trade.baseAmount)}{' '}
									<span {...styles.muted()}>{trade.base.symbol}</span>
								</span>
							</Table.Cell>
							<Table.Cell justify="end" {...styles.wide()} numeric>
								<span {...styles.secondary()}>
									{trade.baseAmount > 0
										? price.format(trade.quoteAmount / trade.baseAmount)
										: '—'}
								</span>
							</Table.Cell>
							<Table.Cell justify="end" {...styles.wide()}>
								<Address address={trade.taker} align="end" chars={4} />
							</Table.Cell>
						</Table.Row>
					))}
					{loading &&
						Array.from({ length: LOADING_ROWS }, (_, index) => (
							<LoadingRow key={index} columns={6} narrow={[1, 2]} />
						))}
				</Table.Body>
			</Table>
		</div>
	)
}

type TradesTableProps = {
	trades: MarketTrade[]
	showVenue: boolean
	loading: boolean
	hasErrors: boolean
}

function LoadingRow(props: LoadingRowProps): React.JSX.Element {
	return (
		<Table.Row aria-busy="true">
			{Array.from({ length: props.columns }, (_, index) => (
				<Table.Cell
					key={index}
					{...((props.narrow ?? [0, 2]).includes(index) ? {} : styles.wide())}
				>
					<Skeleton>
						<span>Loading value</span>
					</Skeleton>
				</Table.Cell>
			))}
		</Table.Row>
	)
}

type LoadingRowProps = {
	columns: number
	/** The columns a phone keeps. */
	narrow?: number[]
}

/**
 * A taker buying base paid quote; selling it received quote. A DEX swap
 * routed through several books has no side.
 */
function TradeLabel(props: TradeLabelProps): React.JSX.Element {
	const { side, base, quote } = props.trade
	return (
		<Inline gap="8" {...styles.nowrap()}>
			{side === null ? (
				<span {...styles.muted()}>Swap</span>
			) : (
				<span {...(side === 'buy' ? styles.buy() : styles.sell())}>
					{side === 'buy' ? 'Buy' : 'Sell'}
				</span>
			)}
			<TokenChip token={base} />
			<span {...styles.muted()}>{side === 'buy' ? 'with' : 'for'}</span>
			<TokenChip token={quote} />
		</Inline>
	)
}

type TradeLabelProps = { trade: MarketTrade }

function TokenChip(props: TokenChipProps): React.JSX.Element {
	return (
		<Inline gap="4" render={<span />}>
			<TokenLogo
				src={`/api/token/logo/${props.token.address}`}
				alt=""
				size="small"
			/>
			<span {...styles.strong()}>{props.token.symbol}</span>
		</Inline>
	)
}

type TokenChipProps = { token: DexPoolToken }

/** The row's own link, so a keyboard reaches what a row click opens. */
function MarketLinkTo(props: MarketLinkToProps): React.JSX.Element {
	const { link, children, title } = props
	if (link.kind === 'pair')
		return (
			<Link
				preload="intent"
				to="/dex/$from/$to"
				params={{ from: link.from, to: link.to }}
				title={title}
				{...styles.link()}
			>
				{children}
			</Link>
		)
	return (
		<Link
			preload="intent"
			to="/address/$address"
			params={{ address: link.address }}
			title={title}
			{...styles.link()}
		>
			{children}
		</Link>
	)
}

type MarketLinkToProps = {
	link: MarketLink
	title: string
	children: React.ReactNode
}

/** A pair, its venue and, unless it trades normally, its status. */
function PairLabel(props: PairLabelProps): React.JSX.Element {
	const { base, quote, kind, link, status, statusDetail } = props.row
	const rowPrice = props.row.price
	return (
		<MarketLinkTo link={link} title={`${base.symbol} / ${quote.symbol}`}>
			<Inline gap="12" render={<span />}>
				<span {...styles.pair()}>
					<TokenLogo src={`/api/token/logo/${base.address}`} alt="" />
					<TokenLogo src={`/api/token/logo/${quote.address}`} alt="" />
				</span>
				<span {...styles.nowrap()}>
					<span {...styles.strong()}>
						{base.symbol}
						<span {...styles.muted()}> / </span>
						{quote.symbol}
					</span>
					<Table.Subtitle>
						<span {...styles.subtitle()}>
							{kind}
							{rowPrice !== null && (
								<span {...styles.narrow()}>
									<span aria-hidden="true">· </span>
									{price.format(rowPrice)}
								</span>
							)}
							{status !== 'live' && (
								<>
									<span aria-hidden="true">·</span>
									<StatusLabel status={status} detail={statusDetail} />
								</>
							)}
						</span>
					</Table.Subtitle>
				</span>
			</Inline>
		</MarketLinkTo>
	)
}

type PairLabelProps = { row: MarketRow }

/** A dot in the status's intent and the venue's own word for it. */
function StatusLabel(props: StatusLabelProps): React.JSX.Element {
	return (
		<StatusIndicator
			intent={statusIntent[props.status]}
			title={props.detail ? statusLabels[props.status] : undefined}
		>
			{props.detail ?? statusLabels[props.status]}
		</StatusIndicator>
	)
}

type StatusLabelProps = { status: MarketStatus; detail: string | null }

function PriceValue(props: PriceValueProps): React.JSX.Element {
	if (props.value === null) return <Dash />
	return (
		<span {...styles.nowrap()}>
			{price.format(props.value)}{' '}
			<span {...styles.muted()}>{props.quote.symbol}</span>
		</span>
	)
}

type PriceValueProps = { value: number | null; quote: DexPoolToken }

function SpreadValue(props: { value: number | null }): React.JSX.Element {
	if (props.value === null) return <Dash />
	return (
		<span {...styles.secondary()}>
			{props.value < 0 ? 'Crossed' : `${bps.format(props.value)} bps`}
		</span>
	)
}

function Volume(props: VolumeProps): React.JSX.Element {
	if (props.loading)
		return (
			<Skeleton>
				<span>$0.00M</span>
			</Skeleton>
		)
	if (props.value === undefined || props.value <= 0) return <Dash />
	return <span>{usd(props.value)}</span>
}

type VolumeProps = { loading: boolean; value: number | undefined }

function Dash(): React.JSX.Element {
	return <span {...styles.muted()}>—</span>
}

/** A headline total: a skeleton while loading, ≥ for a lower bound. */
function Stat(props: StatProps): React.JSX.Element {
	const { total } = props
	const value =
		total === null
			? undefined
			: total.unknown
				? '—'
				: `${total.partial ? '≥' : ''}${usd(total.value)}`
	return (
		<Surface size="medium" {...styles.card()}>
			<Stack gap="8">
				<p
					{...styles.statLabel()}
					title={
						total?.partial
							? 'A lower bound: a venue or some of its reads are unavailable.'
							: undefined
					}
				>
					{props.label}
				</p>
				<Skeleton show={value === undefined}>
					<p {...styles.statValue()}>{value ?? '$0.00M'}</p>
				</Skeleton>
			</Stack>
		</Surface>
	)
}

type StatProps = { label: string; total: MarketTotal }

function EmptyState(props: { title: string }): React.JSX.Element {
	return (
		<Empty.Root>
			<Empty.Title>{props.title}</Empty.Title>
		</Empty.Root>
	)
}

/** A read that failed with nothing cached, and its retry. */
function LoadError(props: LoadErrorProps): React.JSX.Element {
	return (
		<Alert intent={props.intent ?? 'negative'}>
			<Alert.Icon />
			<Alert.Content>
				<Alert.Title>{props.label} unavailable</Alert.Title>
				{props.message}
				<Alert.Action disabled={props.retrying} onClick={props.onRetry}>
					{props.retrying ? 'Retrying…' : 'Try again'}
				</Alert.Action>
			</Alert.Content>
		</Alert>
	)
}

type LoadErrorProps = {
	label: string
	message: string
	retrying: boolean
	onRetry: () => void
	intent?: 'negative' | 'warning' | undefined
}
