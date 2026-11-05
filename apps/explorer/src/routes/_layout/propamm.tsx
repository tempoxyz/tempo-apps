import { useQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import {
	Alert,
	Container,
	Empty,
	formatHex,
	Grid,
	Inline,
	Skeleton,
	Stack,
	StatusIndicator,
	Surface,
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

function PropAmmPage(): React.JSX.Element {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const query = useQuery(propAmmPoolsQueryOptions())
	const tradesQuery = useQuery(propAmmTradesQueryOptions())
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
		// balance counts once, valued by the first listed pair that holds it so
		// sorting can't change the total.
		const held = new Map<string, number>()
		const hold = (key: string, value: number) => {
			if (!held.has(key)) held.set(key, value)
		}
		for (const pool of pools ?? []) {
			if (pool.baseValue === null || pool.quoteValue === null)
				totals.partial = true
			if (pool.baseValue !== null)
				hold(`${pool.address}-${pool.base.address}`, pool.baseValue)
			if (pool.quoteValue !== null)
				hold(`${pool.address}-${pool.quote.address}`, pool.quoteValue)
		}
		for (const value of held.values()) totals.inventory += value
		// A pool that couldn't be read is missing from the totals.
		if (query.data && !query.data.complete) totals.partial = true
		return totals
	}, [pools, query.data, volumeTotals])

	function sortBy(sort: PropAmmSort) {
		const dir =
			search.sort === sort ? (search.dir === 'desc' ? 'asc' : 'desc') : 'desc'
		void navigate({
			search: (previous) => ({ ...previous, sort, dir }),
			replace: true,
			resetScroll: false,
		})
	}

	const tab = search.tab === 'trades' ? 'trades' : 'pools'
	const poolsError = query.isError && !pools
	const tradesError = tradesQuery.isError && !tradesQuery.data

	return (
		<div {...styles.page()}>
			<Container size="wide">
				<Stack gap="32">
					<Stack gap="8">
						<h1 {...styles.title()}>PropAMM</h1>
						<p {...styles.lede()}>
							Live proprietary AMM pools on Tempo: what each pool holds, what it
							quotes and how much it trades.
						</p>
					</Stack>

					<Grid fit="small" gap="16" render={<section aria-label="Totals" />}>
						<Stat
							label="Inventory"
							value={
								pools && `${totals.partial ? '≥' : ''}${usd(totals.inventory)}`
							}
						/>
						<Stat
							label="1D volume"
							value={statVolume(totalsState, totals.day)}
						/>
						<Stat
							label="30D volume"
							value={statVolume(totalsState, totals.month)}
						/>
					</Grid>

					<Tabs.Root
						value={tab}
						onValueChange={(value) =>
							void navigate({
								search: (previous) => ({
									...previous,
									tab: value === 'trades' ? 'trades' : 'pools',
								}),
								replace: true,
								resetScroll: false,
							})
						}
					>
						<Tabs.List aria-label="PropAMM data">
							<Tabs.Tab value="pools">
								Pools
								{pools && <span {...styles.tabCount()}>{rows.length}</span>}
							</Tabs.Tab>
							<Tabs.Tab value="trades">
								Trades
								{tradesQuery.data && pools && (
									<span {...styles.tabCount()}>{trades.length}</span>
								)}
							</Tabs.Tab>
							<Tabs.Indicator />
						</Tabs.List>

						<Tabs.Panel value="pools" {...styles.panel()}>
							<Surface size="medium">
								{poolsError ? (
									<LoadError
										message={query.error.message}
										retrying={query.isFetching}
										onRetry={() => void query.refetch()}
									/>
								) : (
									<PoolsTable
										rows={rows}
										loading={query.isPending}
										volumeState={volumeState}
										search={search}
										onSort={sortBy}
									/>
								)}
							</Surface>
						</Tabs.Panel>

						<Tabs.Panel value="trades" {...styles.panel()}>
							<Surface size="medium">
								{/* Trades are labelled by their pool, so they need the pools read too. */}
								{poolsError ? (
									<LoadError
										message={query.error.message}
										retrying={query.isFetching}
										onRetry={() => void query.refetch()}
									/>
								) : tradesError ? (
									<LoadError
										message={tradesQuery.error.message}
										retrying={tradesQuery.isFetching}
										onRetry={() => void tradesQuery.refetch()}
									/>
								) : (
									<TradesTable
										trades={trades}
										pools={poolsByKey}
										loading={!tradesQuery.data || !pools}
									/>
								)}
							</Surface>
						</Tabs.Panel>
					</Tabs.Root>
				</Stack>
			</Container>
		</div>
	)
}

function PoolsTable(props: {
	rows: PropAmmRow[]
	loading: boolean
	volumeState: VolumeState
	search: PropAmmSearch
	onSort: (sort: PropAmmSort) => void
}): React.JSX.Element {
	const { rows, loading, volumeState, search, onSort } = props
	if (!loading && rows.length === 0)
		return <EmptyState title="No propAMM pools on this network" />

	const sortable = (sort: PropAmmSort, label: string, title?: string) => (
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
				<Table.Caption>PropAMM pools</Table.Caption>
				<Table.Head>
					<Table.Row>
						<Table.HeaderCell>#</Table.HeaderCell>
						<Table.HeaderCell>Pool</Table.HeaderCell>
						<Table.HeaderCell justify="end">Price</Table.HeaderCell>
						{sortable(
							'inventory',
							'Inventory',
							'Base and quote held, in US dollars. Pairs on one venue share its balances.',
						)}
						{sortable('day', '1D vol')}
						{sortable('month', '30D vol')}
						<Table.HeaderCell>State</Table.HeaderCell>
					</Table.Row>
				</Table.Head>
				<Table.Body>
					{loading
						? [0, 1, 2, 3].map((index) => (
								<LoadingRow key={index} columns={7} />
							))
						: rows.map((pool, index) => (
								<Table.Row
									key={pool.key}
									data-href={`/address/${pool.address}`}
									onClick={(event) => {
										if ((event.target as HTMLElement).closest('a')) return
										window.location.assign(`/address/${pool.address}`)
									}}
								>
									<Table.Cell muted numeric>
										{index + 1}
									</Table.Cell>
									<Table.Cell>
										<PoolLabel pool={pool} />
									</Table.Cell>
									<Table.Cell justify="end" numeric>
										<PriceValue pool={pool} />
									</Table.Cell>
									<Table.Cell justify="end" numeric>
										<UsdValue value={pool.inventory} />
									</Table.Cell>
									<Table.Cell justify="end" numeric>
										<Volume state={volumeState} value={pool.volume?.day} />
									</Table.Cell>
									<Table.Cell justify="end" numeric>
										<Volume state={volumeState} value={pool.volume?.month} />
									</Table.Cell>
									<Table.Cell>
										<StateIndicator state={pool.state} />
									</Table.Cell>
								</Table.Row>
							))}
				</Table.Body>
			</Table>
		</div>
	)
}

/** The latest trades of the last 30 days, newest first. */
function TradesTable(props: {
	trades: PropAmmTrade[]
	pools: Map<string, PropAmmPool>
	loading: boolean
}): React.JSX.Element {
	const trades = props.trades.flatMap((trade) => {
		const pool = props.pools.get(trade.poolKey)
		return pool ? [{ trade, pool }] : []
	})
	if (!props.loading && trades.length === 0)
		return <EmptyState title="No trades in the last 30 days" />

	return (
		<div {...styles.scroll()}>
			<Table interactive>
				<Table.Caption>PropAMM trades in the last 30 days</Table.Caption>
				<Table.Head>
					<Table.Row>
						<Table.HeaderCell>Time</Table.HeaderCell>
						<Table.HeaderCell>Trade</Table.HeaderCell>
						<Table.HeaderCell justify="end">Value</Table.HeaderCell>
						<Table.HeaderCell justify="end">Amount</Table.HeaderCell>
						<Table.HeaderCell justify="end">Price</Table.HeaderCell>
						<Table.HeaderCell>Taker</Table.HeaderCell>
					</Table.Row>
				</Table.Head>
				<Table.Body>
					{props.loading
						? [0, 1, 2, 3, 4, 5].map((index) => (
								<LoadingRow key={index} columns={6} />
							))
						: trades.map(({ trade, pool }) => (
								<Table.Row
									key={trade.id}
									data-href={`/tx/${trade.transactionHash}`}
									onClick={(event) => {
										if ((event.target as HTMLElement).closest('a, button'))
											return
										window.location.assign(`/tx/${trade.transactionHash}`)
									}}
								>
									<Table.Cell muted>
										<a
											href={`/tx/${trade.transactionHash}`}
											aria-label="View transaction"
											{...styles.link()}
										>
											<RelativeTime timestamp={BigInt(trade.timestamp)} />
										</a>
									</Table.Cell>
									<Table.Cell>
										<TradeLabel trade={trade} pool={pool} />
									</Table.Cell>
									<Table.Cell justify="end" numeric>
										<UsdValue value={trade.value} />
									</Table.Cell>
									<Table.Cell justify="end" numeric>
										<span {...styles.nowrap()}>
											{amount.format(trade.baseAmount)}{' '}
											<span {...styles.muted()}>{pool.base.symbol}</span>
										</span>
									</Table.Cell>
									<Table.Cell justify="end" numeric>
										<span {...styles.secondary()}>
											{trade.baseAmount > 0
												? price.format(trade.quoteAmount / trade.baseAmount)
												: '—'}
										</span>
									</Table.Cell>
									<Table.Cell>
										<a
											href={`/address/${trade.taker}`}
											title={trade.taker}
											{...styles.link()}
										>
											<span {...styles.mono()}>{formatHex(trade.taker)}</span>
										</a>
									</Table.Cell>
								</Table.Row>
							))}
				</Table.Body>
			</Table>
		</div>
	)
}

function LoadingRow(props: { columns: number }): React.JSX.Element {
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

/** A taker buying base paid quote; selling it received quote. */
function TradeLabel(props: {
	trade: PropAmmTrade
	pool: PropAmmPool
}): React.JSX.Element {
	const buy = !props.trade.baseIn
	return (
		<Inline gap="8" {...styles.nowrap()}>
			<span {...(buy ? styles.buy() : styles.sell())}>
				{buy ? 'Buy' : 'Sell'}
			</span>
			<TokenChip token={props.pool.base} />
			<span {...styles.muted()}>{buy ? 'with' : 'for'}</span>
			<TokenChip token={props.pool.quote} />
		</Inline>
	)
}

function TokenChip(props: { token: DexPoolToken }): React.JSX.Element {
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

function PoolLabel(props: { pool: PropAmmPool }): React.JSX.Element {
	const { address, base, quote, version } = props.pool
	return (
		<Inline
			gap="12"
			render={<a href={`/address/${address}`} {...styles.link()} />}
		>
			<span {...styles.pair()}>
				<TokenLogo src={`/api/token/logo/${base.address}`} alt="" />
				<TokenLogo src={`/api/token/logo/${quote.address}`} alt="" />
			</span>
			<span>
				<span {...styles.strong()}>
					{base.symbol}
					<span {...styles.muted()}> / </span>
					{quote.symbol}
				</span>
				<Table.Subtitle>{version}</Table.Subtitle>
			</span>
		</Inline>
	)
}

/** A dot in the state's intent and its label. */
function StateIndicator(props: { state: PropAmmState }): React.JSX.Element {
	return (
		<StatusIndicator intent={stateIntent[props.state]}>
			{stateLabels[props.state]}
		</StatusIndicator>
	)
}

function PriceValue(props: { pool: PropAmmPool }): React.JSX.Element {
	if (props.pool.price === null) return <span {...styles.muted()}>—</span>
	return (
		<span {...styles.nowrap()}>
			{price.format(props.pool.price)}{' '}
			<span {...styles.muted()}>{props.pool.quote.symbol}</span>
		</span>
	)
}

function UsdValue(props: { value: number | null }): React.JSX.Element {
	if (props.value === null) return <span {...styles.muted()}>—</span>
	return <span>{usd(props.value)}</span>
}

type VolumeState = 'loading' | 'known' | 'unknown'

/** A stat's volume: undefined shows its loading placeholder. */
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
			<Skeleton>
				<span>$0.00M</span>
			</Skeleton>
		)
	if (
		props.state === 'unknown' ||
		props.value === undefined ||
		props.value <= 0
	)
		return <span {...styles.muted()}>—</span>
	return <span>{usd(props.value)}</span>
}

function Stat(props: {
	label: string
	value: string | undefined
}): React.JSX.Element {
	return (
		<Surface size="medium">
			<Stack gap="8">
				<p {...styles.statLabel()}>{props.label}</p>
				<Skeleton show={props.value === undefined}>
					<p {...styles.statValue()}>{props.value ?? '$0.00M'}</p>
				</Skeleton>
			</Stack>
		</Surface>
	)
}

function EmptyState(props: { title: string }): React.JSX.Element {
	return (
		<Empty.Root>
			<Empty.Title>{props.title}</Empty.Title>
		</Empty.Root>
	)
}

function LoadError(props: {
	message: string
	retrying: boolean
	onRetry: () => void
}): React.JSX.Element {
	return (
		<Alert intent="negative">
			<Alert.Icon />
			<Alert.Content>
				{props.message}
				<Alert.Action disabled={props.retrying} onClick={props.onRetry}>
					{props.retrying ? 'Retrying…' : 'Try again'}
				</Alert.Action>
			</Alert.Content>
		</Alert>
	)
}
