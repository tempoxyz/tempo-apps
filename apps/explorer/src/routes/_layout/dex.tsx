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
import {
	dexRouteSearchSchema,
	parseRouteAmount,
	quoteImpact,
	type DexQuote,
	type DexToken,
} from '#lib/dex-route'
import { useMediaQuery } from '#lib/hooks'
import { dexRouteQueryOptions } from '#lib/queries/dex-route'
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
	head: () => ({ meta: [{ title: 'Stablecoin DEX – Tempo Explorer' }] }),
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
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const amountId = useId()
	const [validationError, setValidationError] = useState<string | null>(null)
	const query = useQuery(dexRouteQueryOptions(search))
	const isMobile = useMediaQuery('(max-width: 799px)')
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
					<div className="copy-13 text-tertiary">Stablecoin DEX</div>
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
					<Link
						to="/dex"
						search={{ from: search.to, to: search.from, amount: search.amount }}
						className={headerButton}
						onClick={() => setValidationError(null)}
					>
						<ArrowLeftRightIcon className="size-3.75" />
						Reverse
					</Link>
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
					mode={isMobile ? 'stacked' : 'tabs'}
					sections={[
						{
							title: 'Route legs',
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
