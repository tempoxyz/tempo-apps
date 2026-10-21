import { useQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type * as React from 'react'
import { DexSwapsGrid, LivePill, useDexSwaps } from '#comps/DexSwaps'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
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
import SearchIcon from '~icons/lucide/search'

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
		<div className="flex flex-col gap-6 px-4 pt-8 sm:pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<h1 className="text-[24px] sm:text-[32px] leading-tight tracking-[-0.02em] font-semibold text-primary">
				Stablecoin DEX
			</h1>

			<section
				aria-label="Totals"
				className="grid grid-cols-3 rounded-body border border-card-border bg-card overflow-hidden"
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
							<div className="flex items-center gap-4">
								<label className="relative flex items-center">
									<span className="sr-only">Search pairs</span>
									<SearchIcon
										aria-hidden="true"
										className="absolute left-2 size-3.5 text-tertiary pointer-events-none"
									/>
									<input
										value={filter}
										onChange={(event) => setFilter(event.target.value)}
										placeholder="Search"
										spellCheck={false}
										autoComplete="off"
										className="h-7 w-[160px] rounded-[6px] border border-card-border bg-base-plane pl-7 pr-2 text-base sm:label-12 text-primary outline-none placeholder:text-tertiary focus:border-accent"
									/>
								</label>
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
															<span
																key="rank"
																className="text-tertiary tabular-nums"
															>
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
							<div className="flex items-center gap-4">
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
			className={cx(
				'cursor-pointer hover:text-primary',
				active && 'text-primary',
			)}
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

function PairCell(props: { pool: DexPool }): React.JSX.Element {
	const { base, quote } = props.pool
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
			<span className="truncate font-medium text-primary">
				{base.symbol}
				<span className="text-tertiary"> / </span>
				{quote.symbol}
			</span>
		</div>
	)
}

function LiquidityValue(props: { pool: DexPool }): React.JSX.Element {
	const { liquidity } = props.pool
	// A partial zero means no level could be read, not an empty book.
	if (!liquidity || (liquidity.partial && liquidity.total === 0))
		return <span className="text-tertiary">—</span>
	return (
		<span className="tabular-nums text-primary">
			{liquidity.partial && '≥'}
			{usd(liquidity.total)}
		</span>
	)
}

function SpreadValue(props: { pool: DexPool }): React.JSX.Element {
	const spread = spreadBps(props.pool.bid, props.pool.ask)
	if (spread === null) return <span className="text-tertiary">—</span>
	return (
		<span className="tabular-nums text-secondary">
			{spread < 0 ? 'Crossed' : `${bps.format(spread)} bps`}
		</span>
	)
}

function Volume(props: { value: number }): React.JSX.Element {
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
