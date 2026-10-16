import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from '@tanstack/react-router'
import { useId, useState } from 'react'
import type * as React from 'react'
import { CopyButton } from '#comps/CopyButton'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import {
	dexRouteSearchSchema,
	parseRouteAmount,
	quoteImpact,
	type DexQuote,
	type DexToken,
} from '#lib/dex-route'
import {
	dexRouteQueryOptions,
	dexRouteSwapsQueryOptions,
} from '#lib/queries/dex-route'
import { getTempoChain } from '#wagmi.config'
import ArrowRightIcon from '~icons/lucide/arrow-right'
import ArrowLeftRightIcon from '~icons/lucide/arrow-left-right'
import RefreshCwIcon from '~icons/lucide/refresh-cw'

export const Route = createFileRoute('/_layout/dex')({
	component: DexRoutePage,
	validateSearch: dexRouteSearchSchema,
	search: {
		middlewares: [
			stripSearchParams({
				from: '0x20c00000000000000000000014f22ca97301eb73',
				to: '0x20c0000000000000000000000000000000000000',
				amount: '10000',
			}),
		],
	},
	errorComponent: () => (
		<div className="max-w-[1200px] mx-auto px-4 pt-20 flex flex-col gap-3">
			<h1 className="heading-20 text-primary">Invalid route link</h1>
			<p className="copy-14 text-secondary">
				Use two token addresses and a positive decimal amount.
			</p>
			<Link
				to="/dex"
				search={{
					from: '0x20c00000000000000000000014f22ca97301eb73',
					to: '0x20c0000000000000000000000000000000000000',
					amount: '10000',
				}}
				className="text-accent hover:underline"
			>
				View USDT0 → pathUSD
			</Link>
		</div>
	),
	head: () => ({ meta: [{ title: 'Native DEX route – Tempo Explorer' }] }),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.prefetchQuery(dexRouteQueryOptions(deps)),
})

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })
const rate = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })
const mainnetSymbols: Record<string, string> = {
	'0x20c00000000000000000000014f22ca97301eb73': 'USDT0',
	'0x20c0000000000000000000000000000000000000': 'pathUSD',
}
const button =
	'inline-flex items-center justify-center gap-2 rounded-[7px] border border-card-border px-3 py-2 copy-13 text-secondary hover:text-primary cursor-pointer press-down disabled:opacity-50 disabled:cursor-wait'

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
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const amountId = useId()
	const [validationError, setValidationError] = useState<string | null>(null)
	const query = useQuery(dexRouteQueryOptions(search))
	const swaps = useQuery({
		...dexRouteSwapsQueryOptions(search),
		enabled: Boolean(query.data),
	})
	const snapshot = query.data
	const from = snapshot?.path[0]
	const to = snapshot?.path[snapshot.path.length - 1]
	const impact = snapshot
		? quoteImpact(snapshot.quote, snapshot.reference)
		: null
	const state =
		query.isRefetchError && snapshot
			? 'Previous snapshot'
			: query.isError
				? 'Unavailable'
				: query.isPending
					? 'Loading'
					: snapshot?.quote.status === 'quoted'
						? 'Quote available'
						: snapshot?.quote.status === 'no-liquidity'
							? 'Insufficient liquidity'
							: 'Quote unavailable'

	return (
		<div className="flex flex-col gap-6 px-4 pt-8 sm:pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex flex-col gap-3 min-w-0">
					<div className="copy-13 text-tertiary">
						Native DEX · {getTempoChain().name}
					</div>
					<h1 className="flex flex-wrap items-center gap-3 text-[32px] leading-tight tracking-[-0.02em] font-semibold text-primary">
						{from && to ? (
							<>
								<TokenIcon address={from.address} className="size-7" />
								{from.symbol}
								<ArrowRightIcon className="size-6 text-tertiary" />
								<TokenIcon address={to.address} className="size-7" />
								{to.symbol}
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
					<p className="copy-14 text-secondary">
						Explore the path, compare execution by size, and inspect each
						orderbook.
					</p>
					{!snapshot && (
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
				<div className="flex flex-wrap gap-2">
					<Link
						to="/dex"
						search={{ from: search.to, to: search.from, amount: search.amount }}
						className={button}
						onClick={() => setValidationError(null)}
					>
						<ArrowLeftRightIcon className="size-3.5" />
						Reverse
					</Link>
					<CopyButton
						value={() => window.location.href}
						ariaLabel="Copy route link"
						className={button}
					>
						Copy link
					</CopyButton>
				</div>
			</div>

			<section
				aria-label="Route and quote"
				className="rounded-body border border-card-border bg-card overflow-hidden"
			>
				<div className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-3 border-b border-card-border bg-card-header">
					<h2 className="heading-16 text-primary">Route overview</h2>
					<span role="status" className="copy-13 text-secondary">
						{state}
					</span>
				</div>
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
							<ol
								aria-label="Token path"
								className="flex flex-wrap items-center gap-x-3 gap-y-4 p-[18px] border-b border-dashed border-card-border"
							>
								{snapshot.path.map((token, index) => (
									<li
										key={token.address}
										className="flex items-center gap-3 min-w-0"
									>
										{index > 0 && (
											<ArrowRightIcon
												aria-hidden="true"
												className="size-4 text-tertiary shrink-0"
											/>
										)}
										<TokenLink token={token} />
									</li>
								))}
							</ol>
							<div className="grid md:grid-cols-2">
								<form
									key={`${search.from}:${search.amount}`}
									className="flex flex-col gap-3 p-[18px] md:border-r border-b md:border-b-0 border-dashed border-card-border"
									onSubmit={(event) => {
										event.preventDefault()
										const amount = String(
											new FormData(event.currentTarget).get('amount') ?? '',
										).trim()
										try {
											parseRouteAmount(amount, from.decimals)
										} catch (error) {
											setValidationError(
												error instanceof Error
													? error.message
													: 'Invalid amount.',
											)
											return
										}
										setValidationError(null)
										if (amount === search.amount) void query.refetch()
										else void navigate({ search: { ...search, amount } })
									}}
								>
									<label htmlFor={amountId} className="copy-13 text-secondary">
										Amount in · {from.symbol}
									</label>
									<div className="flex flex-wrap gap-2">
										<input
											id={amountId}
											name="amount"
											inputMode="decimal"
											autoComplete="off"
											defaultValue={search.amount}
											aria-invalid={Boolean(
												validationError || snapshot.inputError,
											)}
											aria-describedby={`${amountId}-error`}
											className="w-full min-w-0 flex-1 basis-40 rounded-[6px] border border-card-border bg-base-plane px-3 py-2.5 text-xl tabular-nums text-primary outline-none focus:border-accent"
										/>
										<button
											type="submit"
											disabled={query.isFetching}
											className={button}
										>
											{query.isFetching ? 'Quoting…' : 'Get quote'}
										</button>
									</div>
									{(validationError || snapshot.inputError) && (
										<p
											id={`${amountId}-error`}
											role={
												validationError || snapshot.inputError
													? 'alert'
													: undefined
											}
											className="copy-13 text-negative"
										>
											{validationError || snapshot.inputError}
										</p>
									)}
									<p className="copy-13 text-tertiary">
										Read-only estimate. Network fees excluded.
									</p>
								</form>
								<div
									className="flex flex-col gap-3 p-[18px]"
									aria-live="polite"
									aria-busy={query.isFetching}
								>
									<div className="copy-13 text-secondary">
										Estimated output · {to.symbol}
									</div>
									{snapshot.quote.amountOut !== null ? (
										<div className="text-[32px] sm:text-[40px] leading-tight tracking-[-0.02em] font-medium tabular-nums text-primary break-all">
											{formatAmount(snapshot.quote.amountOut)}
										</div>
									) : (
										<p className="heading-20 text-primary">
											{snapshot.inputError
												? 'Enter a valid amount'
												: quoteMessage(snapshot.quote)}
										</p>
									)}
									{snapshot.quote.amountOut !== null && (
										<dl className="flex flex-col gap-2 copy-13">
											<div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
												<dt className="text-tertiary">Effective rate</dt>
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
													title="Compared with the quote for 1 input token at the same block"
												>
													Impact vs. 1 {from.symbol}
												</dt>
												<dd className="text-secondary tabular-nums">
													{impact === null
														? 'Unavailable'
														: `${impact.toFixed(2)} bps`}
												</dd>
											</div>
										</dl>
									)}
								</div>
							</div>
							<div className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-3 border-t border-dashed border-card-border copy-13 text-tertiary">
								<span>
									Snapshot at{' '}
									<Link
										to="/block/$id"
										params={{ id: snapshot.blockNumber }}
										className="text-accent hover:underline"
									>
										block {snapshot.blockNumber}
									</Link>{' '}
									· {snapshot.legs.length}{' '}
									{snapshot.legs.length === 1 ? 'leg' : 'legs'}
								</span>
								<button
									type="button"
									onClick={() => void query.refetch()}
									disabled={query.isFetching}
									className="inline-flex items-center gap-2 text-accent hover:underline cursor-pointer disabled:opacity-50"
								>
									<RefreshCwIcon className="size-3" />
									{query.isFetching ? 'Refreshing…' : 'Refresh'}
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
					mode="stacked"
					sections={[
						{
							title: 'Execution by size',
							autoCollapse: false,
							content: (
								<>
									<p className="px-[18px] py-3 copy-13 text-secondary border-b border-dashed border-card-border">
										Quotes across the complete path at the same block. Select an
										amount to inspect it.
									</p>
									<div className="overflow-x-auto">
										<table className="w-full text-left copy-13 tabular-nums whitespace-nowrap">
											<thead className="text-tertiary">
												<tr>
													<th className="px-[18px] py-3 font-normal">
														Amount in · {from.symbol}
													</th>
													<th className="px-[18px] py-3 font-normal text-right">
														Output · {to.symbol}
													</th>
													<th className="px-[18px] py-3 font-normal text-right">
														Impact · bps
													</th>
													<th className="px-[18px] py-3 font-normal">
														Quote status
													</th>
												</tr>
											</thead>
											<tbody>
												{snapshot.depth.map((quote) => {
													const impact = quoteImpact(quote, snapshot.reference)
													return (
														<tr
															key={quote.amountIn}
															className={cx(
																'border-t border-dashed border-card-border',
																Number(quote.amountIn) ===
																	Number(search.amount) && 'bg-card-header',
															)}
														>
															<td className="px-[18px] py-3">
																<Link
																	to="/dex"
																	search={{
																		...search,
																		amount: quote.amountIn,
																	}}
																	onClick={() => setValidationError(null)}
																	className="text-accent hover:underline"
																>
																	{formatAmount(quote.amountIn)}
																</Link>
															</td>
															<td className="px-[18px] py-3 text-right text-primary">
																{quote.amountOut === null
																	? '—'
																	: formatAmount(quote.amountOut)}
															</td>
															<td className="px-[18px] py-3 text-right text-secondary">
																{impact === null ? '—' : impact.toFixed(2)}
															</td>
															<td className="px-[18px] py-3 text-secondary">
																{quote.status === 'quoted'
																	? 'Quoted'
																	: quote.status === 'no-liquidity'
																		? 'Insufficient liquidity'
																		: 'Unavailable'}
															</td>
														</tr>
													)
												})}
											</tbody>
										</table>
									</div>
									<p className="px-[18px] py-3 copy-13 text-tertiary border-t border-dashed border-card-border">
										Impact is relative to a 1 {from.symbol} quote. These sizes
										are samples, not a maximum capacity estimate.
									</p>
								</>
							),
						},
						{
							title: 'Route legs',
							autoCollapse: false,
							content: (
								<div className="flex flex-col">
									{snapshot.legs.map((leg, index) => (
										<div
											key={leg.bookKey}
											className="px-[18px] py-4 border-b last:border-b-0 border-dashed border-card-border flex flex-col gap-3"
										>
											<div className="flex flex-wrap justify-between gap-3">
												<div className="flex flex-wrap items-center gap-2">
													<span className="copy-13 text-tertiary">
														{index + 1}.
													</span>
													<TokenLink token={leg.from} />
													<ArrowRightIcon className="size-3.5 text-tertiary" />
													<TokenLink token={leg.to} />
												</div>
												<span className="copy-13 text-secondary">
													{!leg.exists
														? 'Book not created'
														: leg.bestRate === null
															? 'No resting liquidity on this side'
															: `Best rate: ${rate.format(leg.bestRate)} ${leg.to.symbol} / ${leg.from.symbol}`}
												</span>
											</div>
											<details className="copy-13 text-tertiary">
												<summary className="cursor-pointer hover:text-primary">
													Orderbook details
												</summary>
												<dl className="pt-3 flex flex-col gap-2">
													<div>
														<dt>Direction</dt>
														<dd className="text-secondary">{leg.side}</dd>
													</div>
													<div>
														<dt>Book key</dt>
														<dd className="font-mono break-all text-secondary">
															{leg.bookKey}
														</dd>
													</div>
												</dl>
											</details>
										</div>
									))}
								</div>
							),
						},
						{
							title: 'Recent native DEX swaps',
							autoCollapse: false,
							content: (
								<>
									<p className="px-[18px] py-3 copy-13 text-secondary">
										Direct exact-input swaps only. Router and batched swaps are
										not included.
									</p>
									{swaps.isPending ? (
										<p
											className="px-[18px] pb-4 copy-13 text-tertiary"
											role="status"
										>
											Loading recent swaps…
										</p>
									) : swaps.isError ? (
										<p
											className="px-[18px] pb-4 copy-13 text-tertiary"
											role="status"
										>
											Recent swaps are unavailable.{' '}
											<button
												type="button"
												className="text-accent hover:underline cursor-pointer"
												onClick={() => void swaps.refetch()}
											>
												Try again
											</button>
										</p>
									) : swaps.data?.length ? (
										<div className="overflow-x-auto">
											<table className="w-full text-left copy-13 tabular-nums">
												<thead className="text-tertiary">
													<tr>
														<th className="px-[18px] py-3 font-normal">
															Time · UTC
														</th>
														<th className="px-[18px] py-3 font-normal text-right">
															{from.symbol} in
														</th>
														<th className="px-[18px] py-3 font-normal text-right">
															{to.symbol} out
														</th>
														<th className="px-[18px] py-3 font-normal">
															Transaction
														</th>
													</tr>
												</thead>
												<tbody>
													{swaps.data.map((swap) => (
														<tr
															key={swap.hash}
															className="border-t border-dashed border-card-border"
														>
															<td className="px-[18px] py-3 text-secondary whitespace-nowrap">
																{swap.timestamp
																	? new Date(swap.timestamp * 1000)
																			.toISOString()
																			.replace('T', ' ')
																			.slice(0, 19)
																	: 'Unavailable'}
															</td>
															<td className="px-[18px] py-3 text-right text-primary">
																{formatAmount(swap.amountIn)}
															</td>
															<td className="px-[18px] py-3 text-right text-primary">
																{formatAmount(swap.amountOut)}
															</td>
															<td className="px-[18px] py-3">
																<Link
																	to="/tx/$hash"
																	params={{ hash: swap.hash }}
																	className="text-accent hover:underline font-mono break-all"
																>
																	{swap.hash}
																</Link>
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									) : (
										<p className="px-[18px] pb-4 copy-13 text-tertiary">
											No matching swaps in the recent activity sample.
										</p>
									)}
								</>
							),
						},
						{
							title: 'Details',
							content: (
								<dl className="flex flex-col gap-4 p-[18px] copy-13">
									{snapshot.path.map((token) => (
										<div key={token.address}>
											<dt className="text-tertiary mb-1">{token.symbol}</dt>
											<dd>
												<Link
													to="/address/$address"
													params={{ address: token.address }}
													className="font-mono text-accent hover:underline break-all"
												>
													{token.address}
												</Link>
											</dd>
										</div>
									))}
									<div>
										<dt className="text-tertiary mb-1">Source</dt>
										<dd className="text-secondary">
											Native DEX quotes and orderbooks read from RPC at block{' '}
											{snapshot.blockNumber}. Recent swaps use indexed transfers
											and confirmed transaction receipts.
										</dd>
									</div>
								</dl>
							),
						},
					]}
				/>
			)}
		</div>
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
