import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from '@tanstack/react-router'
import {
	Alert,
	Badge,
	Container,
	Empty,
	formatHex,
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
	type MarketVenue,
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

const usd = (value: number) => PriceFormatter.format(value, { format: 'short' })
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
	export const title = style({
		color: 'content.primary',
		margin: '0',
		typography: 'heading.h2',
	})
	export const lede = style({
		color: 'content.secondary',
		margin: '0',
		maxWidth: '40rem !custom',
		typography: 'body.b1',
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
	export const toolbar = style({
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
	export const mono = style({ typography: 'mono.m1', whiteSpace: 'nowrap' })
	export const secondary = style({ color: 'content.secondary' })
	export const strong = style({ typography: 'body.b2Strong' })
	export const nowrap = style({ whiteSpace: 'nowrap' })
	export const pair = style({
		alignItems: 'center',
		display: 'inline-flex',
		flexShrink: '0 !custom',
		selectors: { '& > :not(:first-child)': { marginInlineStart: '-6' } },
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
}

function MarketsPage(): React.JSX.Element {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const venues = venuesOf(search.venue)
	const showDex = venues.includes('dex')
	const showPropAmm = venues.includes('propamm')

	const dexQuery = useQuery(dexPoolsQueryOptions())
	const propAmmQuery = useQuery(propAmmPoolsQueryOptions())
	const propAmmTradesQuery = useQuery(propAmmTradesQueryOptions())
	// Swaps poll only while their list is on screen. The server applies the
	// verified filter so spam can't crowd the feed.
	const swapsVisible = search.tab === 'trades' && showDex
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

	const rows = useMemo(() => {
		const all = [
			...(showDex ? dexRows(dexPools ?? []) : []),
			...(showPropAmm
				? propAmmRows(
						propAmmPools ?? [],
						propAmmTradesFailed ? undefined : volumeTotals,
					)
				: []),
		]
		return sortMarkets(all, search.sort, search.dir)
	}, [
		showDex,
		showPropAmm,
		dexPools,
		propAmmPools,
		volumeTotals,
		propAmmTradesFailed,
		search.sort,
		search.dir,
	])

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

	const dexPending = showDex && dexQuery.isPending
	const propAmmPending = showPropAmm && propAmmQuery.isPending
	// Trades need their venue's labels: DEX books for buy or sell, propAMM pools
	// for the pair.
	const swapsPending = showDex && swapsQuery.isPending
	const fillsPending =
		showPropAmm &&
		(propAmmTradesQuery.isPending || (propAmmQuery.isPending && !propAmmFailed))

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
	]

	return (
		<div {...styles.page()}>
			<Container size="wide">
				<Stack gap="32">
					<Stack gap="8">
						<h1 {...styles.title()}>Markets</h1>
						<p {...styles.lede()}>
							Every pair trading on Tempo, on the Stablecoin DEX’s order books
							and in PropAMM pools: price, liquidity, spread and volume.
						</p>
					</Stack>

					<div {...styles.toolbar()}>
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
							</Tabs.List>
						</Tabs.Root>
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
								Verified tokens only
							</label>
						)}
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
						<Tabs.List aria-label="Markets data">
							<Tabs.Tab value="pairs">
								Pairs
								{!dexPending && !propAmmPending && (
									<span {...styles.tabCount()}>{rows.length}</span>
								)}
							</Tabs.Tab>
							<Tabs.Tab value="trades">Trades</Tabs.Tab>
							<Tabs.Indicator />
						</Tabs.List>

						<Tabs.Panel value="pairs" {...styles.panel()}>
							<Surface size="medium">
								<Stack gap="16">
									{pairsErrors.map((error) => (
										<LoadError key={error.label} {...error} />
									))}
									<PairsTable
										rows={rows}
										loadingRows={
											(dexPending ? 3 : 0) + (propAmmPending ? 2 : 0)
										}
										volumeLoading={
											showPropAmm &&
											propAmmTradesQuery.isPending &&
											!propAmmTradesFailed
										}
										hasErrors={pairsErrors.length > 0}
										search={search}
										onSort={sortBy}
									/>
								</Stack>
							</Surface>
						</Tabs.Panel>

						<Tabs.Panel value="trades" {...styles.panel()}>
							<Surface size="medium">
								<Stack gap="16">
									{tradesErrors.map((error) => (
										<LoadError key={error.label} {...error} />
									))}
									<TradesTable
										trades={trades}
										showVenue={venues.length > 1}
										loadingRows={
											(swapsPending ? 4 : 0) + (fillsPending ? 4 : 0)
										}
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
	const { rows, loadingRows, volumeLoading, hasErrors, search, onSort } = props
	const rowLink = useRowLink()
	if (loadingRows === 0 && rows.length === 0)
		return hasErrors ? null : <EmptyState title="No pairs on this network" />

	const sortable = (sort: MarketSort, label: string, title?: string) => (
		<Table.HeaderCell
			justify="end"
			title={title}
			aria-sort={
				search.sort === sort
					? search.dir === 'asc'
						? 'ascending'
						: 'descending'
					: undefined
			}
		>
			<Table.SortButton onClick={() => onSort(sort)}>{label}</Table.SortButton>
		</Table.HeaderCell>
	)

	return (
		<div {...styles.scroll()}>
			<Table interactive>
				<Table.Caption>Pairs on the Stablecoin DEX and PropAMM</Table.Caption>
				<Table.Head>
					<Table.Row>
						<Table.HeaderCell>#</Table.HeaderCell>
						<Table.HeaderCell>Pair</Table.HeaderCell>
						<Table.HeaderCell>Venue</Table.HeaderCell>
						<Table.HeaderCell justify="end">Price</Table.HeaderCell>
						{sortable(
							'liquidity',
							'Liquidity',
							'In US dollars. DEX: resting orders at par. PropAMM: the pool’s inventory, which pairs on one v2 venue share.',
						)}
						{sortable('spread', 'Spread')}
						{sortable('day', '1D vol')}
						{sortable('month', '30D vol')}
						<Table.HeaderCell justify="start">Status</Table.HeaderCell>
					</Table.Row>
				</Table.Head>
				<Table.Body>
					{rows.map((row, index) => (
						<Table.Row key={row.key} {...rowLink(marketHref(row.link))}>
							<Table.Cell muted numeric>
								{index + 1}
							</Table.Cell>
							<Table.Cell>
								<PairLabel row={row} />
							</Table.Cell>
							<Table.Cell>
								<VenueBadge venue={row.venue} />
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								<PriceValue value={row.price} quote={row.quote} />
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								{row.liquidity ? (
									<span>
										{row.liquidity.partial && '≥'}
										{usd(row.liquidity.value)}
									</span>
								) : (
									<Dash />
								)}
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								<SpreadValue value={row.spread} />
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								<Volume
									loading={volumeLoading && row.venue === 'propamm'}
									value={row.volume?.day}
								/>
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								<Volume
									loading={volumeLoading && row.venue === 'propamm'}
									value={row.volume?.month}
								/>
							</Table.Cell>
							<Table.Cell justify="start">
								<StatusLabel status={row.status} detail={row.statusDetail} />
							</Table.Cell>
						</Table.Row>
					))}
					{Array.from({ length: loadingRows }, (_, index) => (
						<LoadingRow key={index} columns={9} />
					))}
				</Table.Body>
			</Table>
		</div>
	)
}

type PairsTableProps = {
	rows: MarketRow[]
	/** Placeholder rows for venues still loading. */
	loadingRows: number
	volumeLoading: boolean
	/** A venue failed, so an empty list isn't the whole story. */
	hasErrors: boolean
	search: MarketsSearch
	onSort: (sort: MarketSort) => void
}

/** Both venues' latest trades, newest first. */
function TradesTable(props: TradesTableProps): React.JSX.Element | null {
	const { trades, showVenue, loadingRows, hasErrors } = props
	const rowLink = useRowLink()
	if (loadingRows === 0 && trades.length === 0)
		return hasErrors ? null : <EmptyState title="No recent trades" />

	const columns = showVenue ? 7 : 6
	return (
		<div {...styles.scroll()}>
			<Table interactive>
				<Table.Caption>
					Latest Stablecoin DEX swaps and PropAMM trades of the last 30 days
				</Table.Caption>
				<Table.Head>
					<Table.Row>
						<Table.HeaderCell>Time</Table.HeaderCell>
						{showVenue && <Table.HeaderCell>Venue</Table.HeaderCell>}
						<Table.HeaderCell>Trade</Table.HeaderCell>
						<Table.HeaderCell justify="end">Value</Table.HeaderCell>
						<Table.HeaderCell justify="end">Amount</Table.HeaderCell>
						<Table.HeaderCell justify="end">Price</Table.HeaderCell>
						<Table.HeaderCell justify="start">Taker</Table.HeaderCell>
					</Table.Row>
				</Table.Head>
				<Table.Body>
					{trades.map((trade) => (
						<Table.Row
							key={trade.id}
							{...rowLink(`/tx/${trade.transactionHash}`)}
						>
							<Table.Cell muted>
								<Link
									to="/tx/$hash"
									params={{ hash: trade.transactionHash }}
									aria-label="View transaction"
									{...styles.link()}
								>
									<span {...styles.nowrap()}>
										<RelativeTime timestamp={BigInt(trade.timestamp)} />
									</span>
								</Link>
							</Table.Cell>
							{showVenue && (
								<Table.Cell>
									<VenueBadge venue={trade.venue} />
								</Table.Cell>
							)}
							<Table.Cell>
								<TradeLabel trade={trade} />
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								{trade.value === null ? <Dash /> : usd(trade.value)}
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								<span {...styles.nowrap()}>
									{trade.baseAmount > 0 && trade.baseAmount < 0.01
										? '<0.01'
										: amount.format(trade.baseAmount)}{' '}
									<span {...styles.muted()}>{trade.base.symbol}</span>
								</span>
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								<span {...styles.secondary()}>
									{trade.baseAmount > 0
										? price.format(trade.quoteAmount / trade.baseAmount)
										: '—'}
								</span>
							</Table.Cell>
							<Table.Cell justify="start">
								<Link
									to="/address/$address"
									params={{ address: trade.taker }}
									title={trade.taker}
									{...styles.link()}
								>
									<span {...styles.mono()}>{formatHex(trade.taker)}</span>
								</Link>
							</Table.Cell>
						</Table.Row>
					))}
					{Array.from({ length: loadingRows }, (_, index) => (
						<LoadingRow key={index} columns={columns} />
					))}
				</Table.Body>
			</Table>
		</div>
	)
}

type TradesTableProps = {
	trades: MarketTrade[]
	showVenue: boolean
	loadingRows: number
	hasErrors: boolean
}

function LoadingRow(props: LoadingRowProps): React.JSX.Element {
	return (
		<Table.Row aria-busy="true">
			{Array.from({ length: props.columns }, (_, index) => (
				<Table.Cell key={index}>
					<Skeleton>
						<span>Loading value</span>
					</Skeleton>
				</Table.Cell>
			))}
		</Table.Row>
	)
}

type LoadingRowProps = { columns: number }

/** A taker buying base paid quote; selling it received quote. */
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
	const { link, children } = props
	if (link.kind === 'pair')
		return (
			<Link
				to="/dex/$from/$to"
				params={{ from: link.from, to: link.to }}
				{...styles.link()}
			>
				{children}
			</Link>
		)
	return (
		<Link
			to="/address/$address"
			params={{ address: link.address }}
			{...styles.link()}
		>
			{children}
		</Link>
	)
}

type MarketLinkToProps = { link: MarketLink; children: React.ReactNode }

function PairLabel(props: PairLabelProps): React.JSX.Element {
	const { base, quote, pool, link } = props.row
	return (
		<MarketLinkTo link={link}>
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
						{pool
							? `${pool.version} pool ${formatHex(pool.address)}`
							: 'Order book'}
					</Table.Subtitle>
				</span>
			</Inline>
		</MarketLinkTo>
	)
}

type PairLabelProps = { row: MarketRow }

function VenueBadge(props: VenueBadgeProps): React.JSX.Element {
	return (
		<Badge size="small" variant="outlined" {...styles.nowrap()}>
			{props.venue === 'dex' ? 'DEX' : venueLabels.propamm}
		</Badge>
	)
}

type VenueBadgeProps = { venue: MarketVenue }

/** A dot in the status's intent, its label, and the venue's own word for it. */
function StatusLabel(props: StatusLabelProps): React.JSX.Element {
	return (
		<span {...styles.nowrap()}>
			<StatusIndicator intent={statusIntent[props.status]}>
				{statusLabels[props.status]}
			</StatusIndicator>
			{props.detail && <Table.Subtitle>{props.detail}</Table.Subtitle>}
		</span>
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

function Stat(props: StatProps): React.JSX.Element {
	const { total } = props
	const value =
		total === null
			? undefined
			: total.unknown
				? '—'
				: `${total.partial ? '≥' : ''}${usd(total.value)}`
	return (
		<Surface size="medium">
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
