import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
	useRouterState,
} from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import type * as React from 'react'
import { CopyButton } from '#comps/CopyButton'
import { DexSwapsGrid, LivePill, useDexSwaps } from '#comps/DexSwaps'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import {
	defaultDexRoute,
	depthTicks,
	dexRouteParamsSchema,
	dexRouteSearchSchema,
	parseRouteAmount,
	quoteImpact,
	type DexQuote,
	type DexToken,
} from '#lib/dex-route'
import { useMediaQuery } from '#lib/hooks'
import {
	dexLegDepthQueryOptions,
	dexRouteQueryOptions,
} from '#lib/queries/dex-route'
import type { DexDepthLevel, DexLeg } from '#lib/server/dex-route'
import { getTempoChain } from '#wagmi.config'
import ArrowRightIcon from '~icons/lucide/arrow-right'
import ArrowLeftRightIcon from '~icons/lucide/arrow-left-right'
import ChevronLeftIcon from '~icons/lucide/chevron-left'
import RefreshCwIcon from '~icons/lucide/refresh-cw'

export const Route = createFileRoute('/_layout/dex/$from/$to')({
	component: DexRoutePage,
	params: {
		parse: (params) => dexRouteParamsSchema.parse(params),
		stringify: (params) => params,
	},
	validateSearch: dexRouteSearchSchema,
	search: {
		middlewares: [stripSearchParams({ amount: defaultDexRoute.amount })],
	},
	errorComponent: () => (
		<div className="max-w-[1200px] mx-auto px-4 pt-20 flex flex-col gap-3">
			<h1 className="heading-20 text-primary">Invalid route link</h1>
			<p className="copy-14 text-secondary">
				Use two token addresses and a positive decimal amount.
			</p>
			<Link
				to="/dex/$from/$to"
				params={{ from: defaultDexRoute.from, to: defaultDexRoute.to }}
				className="text-accent hover:underline"
			>
				View USDT0 → pathUSD
			</Link>
		</div>
	),
	head: () => ({ meta: [{ title: 'Stablecoin DEX – Tempo Explorer' }] }),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps, params }) =>
		context.queryClient.prefetchQuery(
			dexRouteQueryOptions({ ...params, ...deps }),
		),
})

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })
const rate = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })
const bps = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const size = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const mainnetSymbols: Record<string, string> = {
	'0x20c00000000000000000000014f22ca97301eb73': 'USDT0',
	'0x20c0000000000000000000000000000000000000': 'pathUSD',
}
const button =
	'inline-flex items-center justify-center gap-2 rounded-[7px] border border-card-border px-3 py-2 copy-13 text-secondary hover:text-primary cursor-pointer press-down disabled:opacity-50 disabled:cursor-wait'
const headerButton =
	// `!` beats regen Button.Icon's sizing inside CopyButton so both buttons match.
	'inline-flex h-7! items-center gap-1.5 rounded-[7px]! border border-card-border px-2.5! copy-13 text-secondary hover:text-primary hover:bg-transparent! active:bg-transparent! [&>svg]:size-3.75! cursor-pointer press-down'

function formatAmount(value: string): string {
	const numeric = Number(value)
	return numeric > 0 && numeric < 0.000001 ? value : number.format(numeric)
}

function quoteMessage(quote: DexQuote): string {
	return quote.status === 'no-liquidity'
		? 'Insufficient liquidity for this amount'
		: 'Quote unavailable'
}

function DexRoutePage(): React.JSX.Element {
	const params = Route.useParams()
	const search = { ...params, ...Route.useSearch() }
	const query = useQuery(dexRouteQueryOptions(search))
	const isMobile = useMediaQuery('(max-width: 799px)')
	const [section, setSection] = useState(0)
	const [live, setLive] = useState(true)
	const [paused, setPaused] = useState(false)
	// Poll only while the feed is on screen.
	const swaps = useDexSwaps(
		live && !paused && (isMobile || section === 1),
		// Someone who opened this pair wants its swaps, verified or not.
		{
			path: query.data?.path.map((token) => token.address),
			bases: query.data?.legs.map((leg) => leg.base.address),
			unverified: true,
		},
		Boolean(query.data),
	)
	const snapshot = query.data
	const from = snapshot?.path[0]
	const to = snapshot?.path[snapshot.path.length - 1]
	const impact = snapshot
		? quoteImpact(snapshot.quote, snapshot.reference)
		: null

	return (
		<div className="flex flex-col gap-6 px-4 pt-8 sm:pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex flex-col gap-3 min-w-0">
					<Link
						to="/dex"
						className="inline-flex items-center gap-1 self-start copy-13 text-tertiary hover:text-primary"
					>
						<ChevronLeftIcon className="size-3.5" />
						Stablecoin DEX
					</Link>
					<h1 className="flex flex-wrap items-center gap-3 text-[24px] sm:text-[32px] leading-tight tracking-[-0.02em] font-semibold text-primary">
						{from && to ? (
							<>
								<span className="inline-flex items-center gap-3 whitespace-nowrap">
									<TokenIcon
										address={from.address}
										className="size-6 sm:size-7 shrink-0"
									/>
									{from.symbol}
								</span>
								<span className="inline-flex items-center gap-3 whitespace-nowrap">
									<ArrowRightIcon className="size-5 sm:size-6 text-tertiary" />
									<TokenIcon
										address={to.address}
										className="size-6 sm:size-7 shrink-0"
									/>
									{to.symbol}
								</span>
							</>
						) : (
							<>
								{getTempoChain().id === 4217
									? (mainnetSymbols[search.from] ?? 'Input token')
									: 'Input token'}
								<ArrowRightIcon className="size-6 text-tertiary" />
								{getTempoChain().id === 4217
									? (mainnetSymbols[search.to] ?? 'Output token')
									: 'Output token'}
							</>
						)}
					</h1>
					{query.isError && !snapshot && (
						<dl className="copy-13 text-secondary flex flex-col gap-2">
							<div>
								<dt className="text-tertiary">Input token</dt>
								<dd className="font-mono break-all">{search.from}</dd>
							</div>
							<div>
								<dt className="text-tertiary">Output token</dt>
								<dd className="font-mono break-all">{search.to}</dd>
							</div>
						</dl>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<CopyButton
						value={() => window.location.href}
						ariaLabel="Copy route link"
						className={headerButton}
					>
						Copy link
					</CopyButton>
				</div>
			</div>

			<section
				aria-label="Route and quote"
				className="rounded-body border border-card-border bg-card overflow-hidden"
			>
				{query.isError && !snapshot ? (
					<div
						role="alert"
						className="p-[18px] copy-14 text-secondary flex flex-col items-start gap-3"
					>
						<p>{query.error.message}</p>
						<button
							type="button"
							className={button}
							onClick={() => void query.refetch()}
						>
							Try again
						</button>
					</div>
				) : query.isPending ? (
					<p role="status" className="p-[18px] copy-14 text-secondary">
						Loading the token path and live quotes…
					</p>
				) : (
					snapshot &&
					from &&
					to && (
						<>
							{snapshot.path.length > 2 && (
								<ol
									aria-label="Token path"
									className="flex flex-wrap items-center gap-x-2.5 gap-y-3 px-[18px] py-3 border-b border-dashed border-card-border"
								>
									{snapshot.path.map((token, index) => (
										<li
											key={token.address}
											className="flex items-center gap-2.5 min-w-0"
										>
											{index > 0 && (
												<ArrowRightIcon
													aria-hidden="true"
													className="size-3.5 text-tertiary shrink-0"
												/>
											)}
											<TokenLink token={token} />
										</li>
									))}
								</ol>
							)}
							<div className="grid md:grid-cols-2">
								<div className="relative">
									<AmountInput
										key={`${search.from}:${search.to}`}
										amount={search.amount}
										token={from}
										inputError={snapshot.inputError}
									/>
									{/* Sits on the divider: below the pay panel when stacked,
									    and level with the amounts side by side. */}
									<Link
										to="/dex/$from/$to"
										params={{ from: search.to, to: search.from }}
										search={{ amount: search.amount }}
										aria-label="Reverse route"
										title="Reverse route"
										className="absolute z-10 left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 md:left-auto md:bottom-auto md:right-0 md:top-[81px] md:translate-x-1/2 md:-translate-y-1/2 inline-flex size-9 items-center justify-center rounded-full border border-card-border bg-card text-secondary hover:text-primary hover:border-accent press-down"
									>
										<ArrowLeftRightIcon className="size-4 max-md:rotate-90" />
									</Link>
								</div>
								<div
									className="flex flex-col gap-4 p-[18px] md:pl-14"
									aria-live="polite"
									aria-busy={query.isFetching}
								>
									<div className="copy-13 text-tertiary">You receive</div>
									<div className="flex items-center justify-between gap-4 min-h-[48px]">
										{snapshot.quote.amountOut !== null ? (
											<div
												className={cx(
													'text-[32px] sm:text-[40px] leading-none tracking-[-0.02em] font-medium tabular-nums text-primary break-all transition-opacity',
													query.isFetching && 'opacity-60',
												)}
											>
												{formatAmount(snapshot.quote.amountOut)}
											</div>
										) : (
											<p className="heading-20 text-secondary">
												{snapshot.inputError
													? 'Enter a valid amount'
													: quoteMessage(snapshot.quote)}
											</p>
										)}
										<TokenBadge token={to} />
									</div>
									{snapshot.quote.amountOut !== null && (
										<dl className="flex flex-col gap-2 copy-13">
											<div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
												<dt className="text-tertiary">Rate</dt>
												<dd className="text-secondary tabular-nums">
													1 {from.symbol} ={' '}
													{rate.format(
														Number(snapshot.quote.amountOut) /
															Number(snapshot.quote.amountIn),
													)}{' '}
													{to.symbol}
												</dd>
											</div>
											<div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
												<dt
													className="text-tertiary"
													title={`Compared with the rate for 1 ${from.symbol} at the same block`}
												>
													Price impact
												</dt>
												<dd className="text-secondary tabular-nums">
													{impact === null ? '—' : `${bps.format(impact)} bps`}
												</dd>
											</div>
										</dl>
									)}
								</div>
							</div>
							<div className="flex items-center justify-between gap-3 px-[18px] py-2.5 border-t border-dashed border-card-border label-12 text-tertiary">
								<Link
									to="/block/$id"
									params={{ id: snapshot.blockNumber }}
									className="tabular-nums hover:text-primary"
								>
									Block {snapshot.blockNumber}
								</Link>
								<button
									type="button"
									onClick={() => void query.refetch()}
									disabled={query.isFetching}
									aria-label="Refresh quote"
									className="inline-flex items-center gap-1.5 hover:text-primary cursor-pointer disabled:cursor-wait"
								>
									<RefreshCwIcon
										className={cx('size-3', query.isFetching && 'animate-spin')}
									/>
									Refresh
								</button>
							</div>
							{query.isRefetchError && (
								<p
									role="alert"
									className="px-[18px] pb-3 copy-13 text-negative"
								>
									Refresh failed. Showing the previous block’s snapshot.
								</p>
							)}
						</>
					)
				)}
			</section>

			{snapshot && from && to && (
				<Sections
					mode={isMobile ? 'stacked' : 'tabs'}
					activeSection={section}
					onSectionChange={setSection}
					sections={[
						{
							title: snapshot.legs.length === 1 ? 'Order book' : 'Order books',
							autoCollapse: false,
							content: (
								<div className="flex flex-col">
									{snapshot.legs.map((leg, index) => (
										<LegRow
											key={`${leg.from.address}:${leg.to.address}`}
											blockNumber={snapshot.blockNumber}
											index={snapshot.legs.length > 1 ? index : undefined}
											leg={leg}
										/>
									))}
								</div>
							),
						},
						{
							title: 'Swaps',
							autoCollapse: false,
							contextual: (
								<LivePill
									live={live && !paused}
									onToggle={() => setLive(!live)}
								/>
							),
							content:
								swaps.isError && !swaps.data ? (
									<p role="alert" className="p-[18px] copy-14 text-secondary">
										{swaps.error.message}
									</p>
								) : (
									// biome-ignore lint/a11y/noStaticElementInteractions: pause on hover
									<div
										onMouseEnter={() => setPaused(true)}
										onMouseLeave={() => setPaused(false)}
									>
										<DexSwapsGrid
											swaps={swaps.data ?? []}
											loading={swaps.isPending}
											live={live && !paused}
											base={
												snapshot.legs.length === 1
													? snapshot.legs[0]?.base.address
													: from.address
											}
										/>
									</div>
								),
						},
						{
							title: 'Details',
							content: (
								<dl className="flex flex-col">
									{snapshot.path.map((token) => (
										<div
											key={token.address}
											className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-[18px] py-3.5 border-b last:border-b-0 border-dashed border-card-border"
										>
											<dt className="inline-flex items-center gap-2 copy-14 font-medium text-primary">
												<TokenIcon address={token.address} />
												{token.symbol}
											</dt>
											<dd className="min-w-0">
												<Link
													to="/address/$address"
													params={{ address: token.address }}
													className="font-mono copy-13 text-accent hover:underline break-all"
												>
													{token.address}
												</Link>
											</dd>
										</div>
									))}
								</dl>
							),
						},
					]}
				/>
			)}
		</div>
	)
}

export function AmountInput(props: AmountInput.Props): React.JSX.Element {
	const { amount, token, inputError } = props
	const navigate = Route.useNavigate()
	const isNavigating = useRouterState({
		select: (state) => state.status === 'pending',
	})
	const amountId = useId()
	const [draft, setDraft] = useState(amount)
	const [validationError, setValidationError] = useState<string | null>(null)
	const submittedAmount = useRef(amount)

	useEffect(() => {
		// Keep newer typing when an earlier quote finishes loading.
		if (amount !== submittedAmount.current) setDraft(amount)
		submittedAmount.current = amount
	}, [amount])

	useEffect(() => {
		if (isNavigating) return
		const timeout = setTimeout(() => {
			const value = draft.trim()
			try {
				parseRouteAmount(value, token.decimals)
			} catch (error) {
				setValidationError(
					error instanceof Error ? error.message : 'Invalid amount.',
				)
				return
			}
			setValidationError(null)
			if (value === amount) return
			submittedAmount.current = value
			void navigate({ search: { amount: value }, replace: true })
		}, 250)
		return () => clearTimeout(timeout)
	}, [draft, amount, token.decimals, navigate, isNavigating])

	const error = validationError || (draft.trim() === amount ? inputError : null)

	return (
		<div className="flex flex-col gap-4 p-[18px] md:pr-14 h-full md:border-r border-b md:border-b-0 border-dashed border-card-border">
			<label htmlFor={amountId} className="copy-13 text-tertiary">
				You pay
			</label>
			<div className="flex items-center justify-between gap-4 min-h-[48px]">
				<input
					id={amountId}
					name="amount"
					inputMode="decimal"
					autoComplete="off"
					placeholder="0"
					value={draft}
					onChange={(event) => {
						setDraft(event.target.value)
						setValidationError(null)
					}}
					aria-invalid={Boolean(error)}
					aria-describedby={error ? `${amountId}-error` : undefined}
					className="w-full min-w-0 bg-transparent p-0 text-[32px] sm:text-[40px] leading-none tracking-[-0.02em] font-medium tabular-nums text-primary outline-none placeholder:text-tertiary aria-invalid:text-negative"
				/>
				<TokenBadge token={token} />
			</div>
			{error && (
				<p
					id={`${amountId}-error`}
					role="alert"
					className="copy-13 text-negative"
				>
					{error}
				</p>
			)}
		</div>
	)
}

export declare namespace AmountInput {
	type Props = {
		amount: string
		token: DexToken
		inputError: string | null
	}
}

function LegRow(props: {
	blockNumber: string
	index: number | undefined
	leg: DexLeg
}): React.JSX.Element {
	const { blockNumber, index, leg } = props
	const depth = useQuery({
		...dexLegDepthQueryOptions({
			from: leg.from.address,
			to: leg.to.address,
			tick: leg.bestTick ?? 0,
			blockNumber,
		}),
		enabled: leg.bestTick !== null,
	})
	const spread =
		leg.bid !== null && leg.ask !== null
			? ((leg.ask - leg.bid) / leg.ask) * 10_000
			: null
	const stats = [
		{ label: 'Bid', value: leg.bid === null ? '—' : leg.bid.toFixed(4) },
		{ label: 'Ask', value: leg.ask === null ? '—' : leg.ask.toFixed(4) },
		{
			label: 'Spread',
			value: spread === null ? '—' : `${bps.format(spread)} bps`,
		},
	]

	return (
		<div className="flex flex-col border-b last:border-b-0 border-dashed border-card-border">
			<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-[18px] py-4">
				<div className="flex items-center gap-2.5 min-w-0">
					{index !== undefined && (
						<span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-card-border label-12 text-tertiary tabular-nums">
							{index + 1}
						</span>
					)}
					<TokenLink token={leg.from} />
					<ArrowRightIcon className="size-3.5 text-tertiary shrink-0" />
					<TokenLink token={leg.to} />
				</div>
				{leg.exists ? (
					<div className="flex flex-wrap items-center gap-x-8 gap-y-3">
						<dl className="flex flex-wrap gap-x-8 gap-y-3">
							{stats.map((stat) => (
								<div key={stat.label} className="flex flex-col gap-1">
									<dt className="label-12 text-tertiary">{stat.label}</dt>
									<dd className="copy-14 tabular-nums text-primary">
										{stat.value}
									</dd>
								</div>
							))}
						</dl>
					</div>
				) : (
					<span className="copy-13 text-tertiary">Book not created</span>
				)}
			</div>
			{leg.bestTick !== null && (
				<div
					className="border-t border-dashed border-card-border"
					aria-live="polite"
				>
					{depth.isPending ? (
						<p role="status" className="px-[18px] py-4 copy-13 text-tertiary">
							Loading depth…
						</p>
					) : depth.isError ? (
						<p role="status" className="px-[18px] py-4 copy-13 text-tertiary">
							Depth is unavailable.{' '}
							<button
								type="button"
								className="text-accent hover:underline cursor-pointer"
								onClick={() => void depth.refetch()}
							>
								Try again
							</button>
						</p>
					) : depth.data.length === 0 ? (
						<p className="px-[18px] py-4 copy-13 text-tertiary">
							No resting orders within {depthTicks} price levels of the best
							price.
						</p>
					) : (
						<DepthLadder levels={depth.data} leg={leg} />
					)}
				</div>
			)}
		</div>
	)
}

/** Each level's bar shows how much of the scanned depth fills by that price. */
function DepthLadder(props: {
	levels: DexDepthLevel[]
	leg: DexLeg
}): React.JSX.Element {
	const { levels, leg } = props
	const total = Number(levels[levels.length - 1]?.cumulativeIn ?? 0)
	// Grid rows let one bar span the whole row; a row's background would
	// repaint per cell.
	const row = 'grid grid-cols-3 gap-4 px-[18px]'
	return (
		<table className="block w-full tabular-nums whitespace-nowrap copy-13 pb-2">
			<thead className="block">
				<tr className={cx(row, 'py-2 label-12 text-tertiary')}>
					<th className="text-left font-normal whitespace-normal break-words">
						Price · {leg.to.symbol} per {leg.from.symbol}
					</th>
					<th className="text-right font-normal whitespace-normal break-words">
						Size · {leg.from.symbol}
					</th>
					<th className="text-right font-normal whitespace-normal break-words">
						Total · {leg.from.symbol}
					</th>
				</tr>
			</thead>
			<tbody className="block">
				{levels.map((level) => (
					<tr key={level.tick} className={cx(row, 'relative py-1.5')}>
						<td className={cx(leg.isBid ? 'text-positive' : 'text-negative')}>
							<span
								aria-hidden="true"
								className={cx(
									'absolute inset-y-px left-0',
									leg.isBid ? 'bg-positive/10' : 'bg-negative/10',
								)}
								style={{
									width: `${total > 0 ? (Number(level.cumulativeIn) / total) * 100 : 0}%`,
								}}
							/>
							<span className="relative">{rate.format(level.rate)}</span>
						</td>
						<td className="relative text-right text-secondary">
							{size.format(Number(level.amountIn))}
						</td>
						<td className="relative text-right text-primary">
							{size.format(Number(level.cumulativeIn))}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	)
}

function TokenBadge(props: { token: DexToken }): React.JSX.Element {
	return (
		<Link
			to="/address/$address"
			params={{ address: props.token.address }}
			className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-card-border bg-base-plane pl-1.5 pr-3 copy-14 font-medium text-primary hover:border-accent press-down"
		>
			<TokenIcon address={props.token.address} className="size-6" />
			{props.token.symbol}
		</Link>
	)
}

function TokenLink(props: { token: DexToken }): React.JSX.Element {
	return (
		<Link
			to="/address/$address"
			params={{ address: props.token.address }}
			className="inline-flex items-center gap-2 copy-14 font-medium text-primary hover:text-accent min-w-0"
		>
			<TokenIcon address={props.token.address} />
			<span className="break-all">{props.token.symbol}</span>
		</Link>
	)
}
