import { useQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import {
	Callout,
	Checkbox,
	Field,
	Input,
	Skeleton,
	style,
	variants,
	vars,
} from '@tempoxyz/ds'
import { Search as SearchIcon } from '@tempoxyz/ds/icons'
import { useMemo, useState } from 'react'
import type * as React from 'react'
import { cx } from 'zyzz'
import { DataGrid } from '#comps/DataGrid'
import { DexSwapsGrid, LivePill, useDexSwaps } from '#comps/DexSwaps'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
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
		minWidth: 96,
		sortDirection: search.sort === sort ? search.dir : undefined,
	})

	return (
		<div {...styles.page()}>
			<h1 {...styles.title()}>Stablecoin DEX</h1>

			<section aria-label="Totals" {...styles.totals()}>
				<div {...styles.stats()}>
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
				</div>
			</section>

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
						totalItems: pools ? rows.length : undefined,
						itemsLabel: 'pairs',
						autoCollapse: false,
						contextual: (
							<div {...styles.contextual()}>
								<Input.Group size="small" variant="search" {...styles.filter()}>
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
												minWidth: 200,
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
						autoCollapse: false,
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
			aria-label={`Sort by ${props.label}`}
			aria-pressed={active}
			{...styles.sort({ active })}
		>
			{props.label}
		</button>
	)
}

function Stat(props: {
	label: string
	value: string | undefined
}): React.JSX.Element {
	return (
		<div {...styles.stat()}>
			<div {...styles.statLabel()}>{props.label}</div>
			{/* The placeholder text sizes the skeleton to the value it awaits. */}
			<Skeleton show={props.value === undefined} {...styles.statSkeleton()}>
				<span {...styles.statValue()}>{props.value ?? '$0.00M'}</span>
			</Skeleton>
		</div>
	)
}

function PairCell(props: { pool: DexPool }): React.JSX.Element {
	const { base, quote } = props.pool
	return (
		<div {...styles.pair()}>
			<span {...styles.pairIcons()}>
				<span {...styles.pairIcon({ overlap: false })}>
					<TokenIcon address={base.address} size={20} />
				</span>
				<span {...styles.pairIcon({ overlap: true })}>
					<TokenIcon address={quote.address} size={20} />
				</span>
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
		gap: '6',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingBottom: '16',
		paddingInline: '4',
		paddingTop: '8',
		width: '100% !custom',
		'@media (width >= 640px)': { paddingTop: '16' },
	})

	export const title = style({
		color: 'foreground',
		typography: 'heading.24.subtle',
		'@media (width >= 640px)': { typography: 'heading.32.subtle' },
	})

	// An unpadded bordered card: TDS `Surface` always pads its content, and the
	// stat dividers run edge to edge.
	export const totals = style({
		backgroundColor: 'background.surface',
		borderColor: 'grayAlpha.200',
		borderRadius: 'xl',
		borderStyle: 'solid',
		borderWidth: '1px',
		boxSizing: 'border-box',
		color: 'foreground',
		overflow: 'hidden',
	})

	export const stats = style({
		display: 'grid',
		gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
	})

	export const stat = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
		paddingBlock: '4',
		paddingInline: '4',
		selectors: {
			'&:not(:last-child)': {
				borderColor: 'grayAlpha.200',
				borderRightStyle: 'dashed',
				borderRightWidth: '1px',
			},
		},
	})

	export const statLabel = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const statValue = style({
		color: 'foreground',
		display: 'block',
		fontVariantNumeric: 'tabular-nums',
		typography: 'heading.20.subtle',
		'@media (width >= 640px)': { typography: 'heading.24.subtle' },
	})

	// Shrinks the skeleton to its value instead of the whole column.
	export const statSkeleton = style({ alignSelf: 'flex-start' })

	export const contextual = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
	})

	export const filter = style({ width: '160px !custom' })

	// Keeps "Verified only" on one line in the section header.
	export const verified = style({ whiteSpace: 'nowrap' })

	export const alert = style({ padding: '4' })

	export const sort = variants({
		base: {
			cursor: 'pointer',
			'@media (hover: hover)': { ':hover': { color: 'foreground' } },
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
		gap: '2',
		minWidth: '0 !custom',
	})

	export const pairIcons = style({
		alignItems: 'center',
		display: 'inline-flex',
		flexShrink: 0,
	})

	// The ring separates the overlapping icons on the card surface.
	export const pairIcon = variants({
		base: {
			borderRadius: 'full',
			boxShadow: `0 0 0 2px ${vars.color.background.surface} !custom`,
			display: 'inline-flex',
		},
		defaultVariants: { overlap: false },
		variants: {
			overlap: {
				true: { marginLeft: '-6px !custom' },
				false: { position: 'relative', zIndex: 1 },
			},
		},
	})

	export const pairName = style({
		color: 'foreground',
		fontWeight: 'medium',
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
