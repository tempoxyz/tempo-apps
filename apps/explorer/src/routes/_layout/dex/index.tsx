import { useQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import {
	Callout,
	Checkbox,
	Field,
	Grid,
	Input,
	Skeleton,
	style,
	Surface,
	Token,
	variants,
} from '@tempoxyz/ds'
import { Search as SearchIcon } from '@tempoxyz/ds/icons'
import { useMemo, useState } from 'react'
import type * as React from 'react'
import { cx } from 'zyzz'
import { DataGrid } from '#comps/DataGrid'
import { DexSwapsGrid, LivePill, useDexSwaps } from '#comps/DexSwaps'
import { RelativeTime } from '#comps/RelativeTime'
import { Sections } from '#comps/Sections'
import {
	type DexPool,
	type DexPoolSort,
	type DexPoolsSearch,
	defaultDexPoolsSearch,
	dexPoolsSearchSchema,
	matchesPoolQuery,
	sortPools,
	spreadBps,
} from '#lib/dex-pools'
import { PriceFormatter } from '#lib/formatting'
import { useMediaQuery } from '#lib/hooks'
import { dexPoolsQueryOptions } from '#lib/queries/dex-pools'
import { truncate } from '#styles/explorer'

export const Route = createFileRoute('/_layout/dex/')({
	component: DexPoolsPage,
	validateSearch: dexPoolsSearchSchema,
	search: { middlewares: [stripSearchParams(defaultDexPoolsSearch)] },
	head: () => ({ meta: [{ title: 'Stablecoin DEX – Tempo Explorer' }] }),
	// Prefetch caches failures too, letting the page render its retry state.
	loader: ({ context }) =>
		context.queryClient.prefetchQuery(dexPoolsQueryOptions()),
})

// Metrics in compact dollars, such as $1.2M: TDS `Amount` has no compact notation.
const usd = (value: number) => PriceFormatter.format(value, { format: 'short' })
const bps = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

function DexPoolsPage(): React.JSX.Element {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const query = useQuery(dexPoolsQueryOptions())
	const isMobile = useMediaQuery('(max-width: 799px)')
	const [filter, setFilter] = useState('')
	const [live, setLive] = useState(true)
	const [paused, setPaused] = useState(false)
	// Poll only while the feed is on screen.
	// The server applies the verified filter so spam can't crowd the feed.
	const swapsQuery = useDexSwaps(
		live && !paused && (isMobile || search.tab === 'swaps'),
		{ unverified: search.unverified },
	)
	const swaps = swapsQuery.data ?? []

	const pools = useMemo(
		() =>
			query.data?.pools.filter(
				(pool) =>
					search.unverified || (pool.base.verified && pool.quote.verified),
			),
		[query.data, search.unverified],
	)
	const rows = useMemo(
		() =>
			sortPools(
				(pools ?? []).filter(
					(pool) => pool.status === 'active' && matchesPoolQuery(pool, filter),
				),
				search.sort,
				search.dir,
			),
		[pools, search.sort, search.dir, filter],
	)
	// Volume includes fills on books a token has since moved off.
	const totals = useMemo(() => {
		const totals = { liquidity: 0, partial: false, day: 0, month: 0 }
		for (const pool of pools ?? []) {
			totals.day += pool.volume.day
			totals.month += pool.volume.month
			if (pool.status !== 'active') continue
			totals.liquidity += pool.liquidity?.total ?? 0
			totals.partial ||= !pool.liquidity || pool.liquidity.partial
		}
		return totals
	}, [pools])

	function setVerifiedOnly(verifiedOnly: boolean) {
		void navigate({
			search: (previous) => ({ ...previous, unverified: !verifiedOnly }),
			replace: true,
			resetScroll: false,
		})
	}

	function sortBy(sort: DexPoolSort) {
		const dir =
			search.sort === sort
				? search.dir === 'desc'
					? 'asc'
					: 'desc'
				: sort === 'spread'
					? 'asc'
					: 'desc'
		void navigate({
			search: (previous) => ({ ...previous, sort, dir }),
			replace: true,
			resetScroll: false,
		})
	}

	const sortable = (sort: DexPoolSort, label: string): DataGrid.Column => ({
		label: (
			<SortLabel sort={sort} label={label} search={search} onSort={sortBy} />
		),
		align: 'end',
		width: '1fr',
		sortDirection: search.sort === sort ? search.dir : undefined,
	})

	return (
		<div {...styles.page()}>
			<header {...styles.header()}>
				<h1 {...styles.title()}>Stablecoin DEX</h1>
				{query.data && (
					<p {...styles.meta()}>
						Block {BigInt(query.data.blockNumber).toLocaleString('en-US')} ·
						Updated{' '}
						<RelativeTime
							timestamp={BigInt(Math.floor(query.data.generatedAt / 1000))}
						/>
					</p>
				)}
			</header>

			<Grid
				fit="small"
				gap="12"
				render={<dl aria-label="Totals" />}
				{...styles.stats()}
			>
				<Stat
					label="Liquidity"
					value={
						!pools
							? undefined
							: totals.partial && totals.liquidity === 0
								? '—'
								: `${totals.partial ? '≥' : ''}${usd(totals.liquidity)}`
					}
				/>
				<Stat label="1D volume" value={pools && usd(totals.day)} />
				<Stat label="30D volume" value={pools && usd(totals.month)} />
			</Grid>

			<Sections
				mode={isMobile ? 'stacked' : 'tabs'}
				activeSection={search.tab === 'swaps' ? 1 : 0}
				onSectionChange={(index) =>
					void navigate({
						search: (previous) => ({
							...previous,
							tab: index === 1 ? 'swaps' : 'pairs',
						}),
						replace: true,
						resetScroll: false,
					})
				}
				sections={[
					{
						title: 'Pairs',
						contextual: (
							<div {...styles.contextual()}>
								<Input.Group size="small" {...styles.filter()}>
									<Input.Prefix>
										<SearchIcon aria-hidden="true" />
									</Input.Prefix>
									<Input.Control
										aria-label="Search pairs"
										value={filter}
										onValueChange={(value) => setFilter(value)}
										placeholder="Search"
										spellCheck={false}
										autoComplete="off"
									/>
								</Input.Group>
								<VerifiedToggle
									checked={!search.unverified}
									onChange={setVerifiedOnly}
								/>
							</div>
						),
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
											{ label: 'Pair', align: 'start', width: '1fr' },
											{
												...sortable('liquidity', 'Liquidity'),
												width: 'max-content',
											},
										],
										tabs: [
											{ label: '#', align: 'start', width: 48 },
											{
												label: 'Pair',
												align: 'start',
												width: '2fr',
											},
											sortable('liquidity', 'Liquidity'),
											sortable('spread', 'Spread'),
											sortable('day', '1D vol'),
											sortable('month', '30D vol'),
										],
									}}
									items={(mode) =>
										rows.map((pool, index) => ({
											key: pool.key,
											cells:
												mode === 'stacked'
													? [
															<PairCell key="pair" pool={pool} />,
															<LiquidityValue key="liquidity" pool={pool} />,
														]
													: [
															<span key="rank" {...styles.rank()}>
																{index + 1}
															</span>,
															<PairCell key="pair" pool={pool} />,
															<LiquidityValue key="liquidity" pool={pool} />,
															<SpreadValue key="spread" pool={pool} />,
															<Volume key="day" value={pool.volume.day} />,
															<Volume key="month" value={pool.volume.month} />,
														],
											link: {
												href: `/dex/${pool.base.address}/${pool.quote.address}`,
												title: `${pool.base.symbol} → ${pool.quote.symbol}`,
											},
										}))
									}
									totalItems={rows.length}
									page={1}
									loading={query.isPending}
									itemsPerPage={Math.max(rows.length, 5)}
									itemsLabel="pairs"
									pagination="simple"
									showSimpleCount={false}
									emptyState={filter ? 'No matching pairs' : 'No pairs'}
								/>
							),
					},
					{
						title: 'Swaps',
						contextual: (
							<div {...styles.contextual()}>
								<LivePill
									live={live && !paused}
									onToggle={() => setLive(!live)}
								/>
								<VerifiedToggle
									checked={!search.unverified}
									onChange={setVerifiedOnly}
								/>
							</div>
						),
						content:
							swapsQuery.isError && !swapsQuery.data ? (
								<LoadError
									message={swapsQuery.error.message}
									retrying={swapsQuery.isFetching}
									onRetry={() => void swapsQuery.refetch()}
								/>
							) : (
								// biome-ignore lint/a11y/noStaticElementInteractions: pause on hover
								<div
									onMouseEnter={() => setPaused(true)}
									onMouseLeave={() => setPaused(false)}
								>
									<DexSwapsGrid
										swaps={swaps}
										loading={swapsQuery.isPending}
										live={live && !paused}
									/>
								</div>
							),
					},
				]}
			/>
		</div>
	)
}

function VerifiedToggle(props: {
	checked: boolean
	onChange: (checked: boolean) => void
}): React.JSX.Element {
	return (
		<Field.Root>
			<Field.Item {...styles.verified()}>
				<Checkbox checked={props.checked} onCheckedChange={props.onChange} />
				<Field.Label>Verified only</Field.Label>
			</Field.Item>
		</Field.Root>
	)
}

function LoadError(props: {
	message: string
	retrying: boolean
	onRetry: () => void
}): React.JSX.Element {
	return (
		<div {...styles.alert()}>
			<Callout intent="negative">
				<Callout.Icon />
				<Callout.Content>{props.message}</Callout.Content>
				<Callout.Action disabled={props.retrying} onClick={props.onRetry}>
					{props.retrying ? 'Retrying…' : 'Try again'}
				</Callout.Action>
			</Callout>
		</div>
	)
}

/**
 * A sort button inside the column header, as TDS Tables and Lists prescribes:
 * the header carries `aria-sort` and the direction icon.
 */
function SortLabel(props: {
	sort: DexPoolSort
	label: string
	search: DexPoolsSearch
	onSort: (sort: DexPoolSort) => void
}): React.JSX.Element {
	const active = props.search.sort === props.sort
	return (
		<button
			type="button"
			onClick={() => props.onSort(props.sort)}
			{...styles.sort({ active })}
		>
			{props.label}
		</button>
	)
}

/** A metric tile: the label in a `dt`, the value in a `dd`. */
function Stat(props: {
	label: string
	value: string | undefined
}): React.JSX.Element {
	return (
		<Surface size="small">
			<dt {...styles.statLabel()}>{props.label}</dt>
			<dd {...styles.statValue()}>
				{/* The placeholder text sizes the skeleton to the value it awaits. */}
				<Skeleton show={props.value === undefined}>
					<span>{props.value ?? '$0.00M'}</span>
				</Skeleton>
			</dd>
		</Surface>
	)
}

function PairCell(props: { pool: DexPool }): React.JSX.Element {
	const { base, quote } = props.pool
	return (
		<div {...styles.pair()}>
			<span {...styles.pairIcons()}>
				<Token address={base.address} />
				<Token address={quote.address} />
			</span>
			<span {...cx(styles.pairName(), truncate())}>
				{base.symbol}
				<span {...styles.secondary()}> / </span>
				{quote.symbol}
			</span>
		</div>
	)
}

function LiquidityValue(props: { pool: DexPool }): React.JSX.Element {
	const { liquidity } = props.pool
	// A partial zero means no level could be read, not an empty book.
	if (!liquidity || (liquidity.partial && liquidity.total === 0))
		return <span {...styles.secondary()}>—</span>
	return (
		<span {...styles.number({ tone: 'primary' })}>
			{liquidity.partial && '≥'}
			{usd(liquidity.total)}
		</span>
	)
}

function SpreadValue(props: { pool: DexPool }): React.JSX.Element {
	const spread = spreadBps(props.pool.bid, props.pool.ask)
	if (spread === null) return <span {...styles.secondary()}>—</span>
	return (
		<span {...styles.number({ tone: 'secondary' })}>
			{spread < 0 ? 'Crossed' : `${bps.format(spread)} bps`}
		</span>
	)
}

function Volume(props: { value: number }): React.JSX.Element {
	return (
		<span
			{...styles.number({ tone: props.value > 0 ? 'primary' : 'secondary' })}
		>
			{props.value > 0 ? usd(props.value) : '—'}
		</span>
	)
}

namespace styles {
	export const page = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '24',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingBottom: '64',
		paddingInline: '16',
		paddingTop: '32',
		width: '100% !custom',
		'@media (width >= 640px)': { paddingTop: '64' },
	})

	export const header = style({
		display: 'flex',
		flexDirection: 'column',
		rowGap: '8',
	})

	export const title = style({
		color: 'foreground',
		margin: '0',
		typography: 'heading.24.subtle',
		'@media (width >= 640px)': { typography: 'heading.32.subtle' },
	})

	export const meta = style({
		color: 'gray.900',
		fontVariantNumeric: 'tabular-nums !custom',
		margin: '0',
		typography: 'copy.13',
	})

	export const stats = style({ margin: '0' })

	export const statLabel = style({
		color: 'gray.900',
		marginBlockEnd: '8',
		typography: 'label.13',
	})

	// A flex row, so the skeleton shrinks to the value instead of the tile.
	export const statValue = style({
		color: 'foreground',
		display: 'flex',
		fontVariantNumeric: 'tabular-nums !custom',
		margin: '0',
		typography: 'heading.20',
		'@media (width >= 640px)': { typography: 'heading.24' },
	})

	export const contextual = style({
		alignItems: 'center',
		display: 'flex',
		gap: '16',
	})

	export const filter = style({ width: '160' })

	// Keeps "Verified only" on one line in the section header.
	export const verified = style({ whiteSpace: 'nowrap' })

	export const alert = style({ padding: '16' })

	export const sort = variants({
		base: {
			appearance: 'none !custom',
			backgroundColor: 'transparent !custom',
			border: 'none !custom',
			borderRadius: '2',
			cursor: 'pointer',
			font: 'inherit !custom',
			outlineColor: 'transparent !custom',
			outlineOffset: '2px !custom',
			outlineStyle: 'solid !custom',
			outlineWidth: '2px !custom',
			padding: '0',
			transitionDuration: '160',
			transitionProperty: 'color, outline-color',
			transitionTimingFunction: 'snappy',
			selectors: {
				'&:focus-visible': { outlineColor: 'blue.700' },
				'&:hover': { color: 'foreground' },
			},
		},
		defaultVariants: { active: false },
		variants: {
			active: {
				true: { color: 'foreground' },
				false: { color: 'gray.900' },
			},
		},
	})

	export const rank = style({
		color: 'gray.900',
		fontVariantNumeric: 'tabular-nums',
	})

	export const pair = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const pairIcons = style({
		alignItems: 'center',
		display: 'inline-flex',
		flexShrink: 0,
		gap: '4',
	})

	export const pairName = style({
		color: 'foreground',
		typography: 'copy.14.strong',
	})

	export const secondary = style({ color: 'gray.900' })

	export const number = variants({
		base: { fontVariantNumeric: 'tabular-nums' },
		defaultVariants: { tone: 'primary' },
		variants: {
			tone: {
				primary: { color: 'foreground' },
				secondary: { color: 'gray.900' },
			},
		},
	})
}
