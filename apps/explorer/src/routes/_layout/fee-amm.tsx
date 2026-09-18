import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { useId, useState } from 'react'
import type * as React from 'react'
import { FeeAmmPoolList, FeeAmmQueryState } from '#comps/FeeAmmPools'
import { TokenIcon } from '#comps/TokenIcon'
import { FEE_AMM_MAX_ROWS, feeAmmSearchSchema } from '#lib/fee-amm'
import { PriceFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import { feeAmmPoolsQueryOptions } from '#lib/queries/fee-amm'

export const Route = createFileRoute('/_layout/fee-amm')({
	component: FeeAmmPage,
	errorComponent: () => (
		<div className="mx-auto max-w-[1200px] px-4 pt-20 flex flex-col gap-3">
			<h1 className="text-xl text-primary">Invalid Fee AMM link</h1>
			<p className="text-sm text-secondary">
				Check the token address and page number, or start from all pools.
			</p>
			<Link
				to="/fee-amm"
				search={{ page: 1, limit: 10 }}
				className="text-accent hover:underline"
			>
				View all pools
			</Link>
		</div>
	),
	validateSearch: feeAmmSearchSchema,
	search: { middlewares: [stripSearchParams({ page: 1, limit: 10 })] },
	head: () => ({ meta: [{ title: 'Fee AMM – Tempo Explorer' }] }),
	loaderDeps: ({ search }) => search,
	// Prefetch caches failures too, letting the page render its retry state.
	loader: ({ context, deps }) =>
		context.queryClient.prefetchQuery(feeAmmPoolsQueryOptions(deps)),
})

function FeeAmmPage(): React.JSX.Element {
	const search = Route.useSearch()
	const filterId = useId()
	const errorId = useId()
	const navigate = Route.useNavigate()
	const query = useQuery(feeAmmPoolsQueryOptions(search))
	const { copy, notifying } = useCopy()
	const [filterError, setFilterError] = useState<string>()
	const pools = query.data?.pools ?? []
	const maxPage = Math.floor(FEE_AMM_MAX_ROWS / search.limit)
	const sample = pools.find((pool) =>
		[pool.userToken, pool.validatorToken].some(
			(token) => token.toLowerCase() === search.token?.toLowerCase(),
		),
	)
	const symbol =
		sample?.userToken.toLowerCase() === search.token?.toLowerCase()
			? sample?.userTokenSymbol
			: sample?.validatorTokenSymbol
	const liquidity =
		pools.length && pools.every((pool) => pool.liquidityUsd !== null)
			? pools.reduce((sum, pool) => sum + (pool.liquidityUsd ?? 0), 0)
			: null

	return (
		<div className="flex flex-col gap-5 px-4 pt-8 sm:pt-16 pb-16 max-w-[1200px] mx-auto w-full">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex flex-col gap-3 min-w-0">
					{search.token && (
						<Link
							to="/fee-amm"
							search={{ page: 1, limit: search.limit }}
							className="text-sm text-accent hover:underline"
						>
							← All Fee AMM pools
						</Link>
					)}
					<h1 className="flex items-center gap-3 text-[32px] leading-tight tracking-[-0.02em] font-semibold text-primary">
						{search.token && <TokenIcon address={search.token} />}
						{search.token ? `${symbol ?? 'Token'} Fee AMM` : 'Fee AMM'}
					</h1>
					<p className="text-sm text-secondary max-w-[680px]">
						Liquidity that converts transaction fees into a validator’s
						preferred token. Each pool has a fee token and a validator token.
					</p>
					{search.token && (
						<Link
							to="/address/$address"
							params={{ address: search.token }}
							search={{ tab: 'token' }}
							className="text-xs font-mono text-accent hover:underline break-all"
						>
							{search.token}
						</Link>
					)}
				</div>
				<button
					type="button"
					onClick={() => copy(window.location.href)}
					className="rounded-md border border-distinct px-3 py-2 text-sm text-primary hover:bg-alt press-down"
				>
					{notifying ? 'Link copied' : 'Copy link'}
				</button>
			</div>

			<form
				key={search.token ?? 'all'}
				className="flex flex-wrap items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault()
					const value = String(
						new FormData(event.currentTarget).get('token') ?? '',
					).trim()
					if (value && !Address.validate(value)) {
						setFilterError('Enter a valid token contract address.')
						return
					}
					setFilterError(undefined)
					void navigate({
						search: {
							token: value ? Address.from(value.toLowerCase()) : undefined,
							page: 1,
							limit: search.limit,
						},
					})
				}}
			>
				<div className="flex flex-col gap-1.5 flex-1 min-w-[220px]">
					<label htmlFor={filterId} className="text-xs text-secondary">
						Find pools by token address
					</label>
					<input
						id={filterId}
						name="token"
						defaultValue={search.token ?? ''}
						placeholder="0x…"
						spellCheck={false}
						autoComplete="off"
						aria-invalid={Boolean(filterError)}
						aria-describedby={filterError ? errorId : undefined}
						className="rounded-md border border-distinct bg-card px-3 py-2 font-mono text-base sm:text-sm text-primary"
					/>
				</div>
				<button
					type="submit"
					className="rounded-md border border-distinct px-4 py-2 text-sm text-primary hover:bg-alt press-down"
				>
					Find pools
				</button>
				{filterError && (
					<p id={errorId} role="alert" className="w-full text-sm text-negative">
						{filterError}
					</p>
				)}
			</form>

			<div className="rounded-[10px] border border-card-border bg-card overflow-hidden">
				<div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 border-b border-distinct">
					<div className="flex flex-col gap-1">
						<h2 className="text-sm font-medium text-primary">
							{search.token ? 'Pools for this token' : 'Liquidity pools'}
						</h2>
						<p className="text-xs text-tertiary">
							Most active first · Reserves shown in each token’s units
						</p>
					</div>
					{query.data && pools.length > 0 && (
						<div className="text-right">
							<div className="text-lg font-mono tabular-nums text-primary">
								{liquidity === null
									? 'Unavailable'
									: PriceFormatter.format(liquidity)}
							</div>
							<div className="text-xs text-tertiary">
								Estimated liquidity · {pools.length}{' '}
								{pools.length === 1 ? 'pool' : 'pools'} on this page
							</div>
						</div>
					)}
				</div>
				<FeeAmmQueryState query={query} />
				{query.data && (
					<>
						<FeeAmmPoolList pools={pools} token={search.token} />
						{pools.length === 0 && !query.isError && (
							<div className="px-4 py-10 text-center text-sm text-secondary">
								{search.page > 1
									? 'No more pools on this page.'
									: search.token
										? 'No Fee AMM pools found for this token.'
										: 'No Fee AMM pools found.'}
							</div>
						)}
					</>
				)}
				<nav
					aria-label="Fee AMM pagination"
					className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-t border-distinct text-sm"
				>
					<div className="flex items-center gap-2">
						<Link
							to="/fee-amm"
							search={{ ...search, page: Math.max(1, search.page - 1) }}
							resetScroll={false}
							disabled={search.page === 1 || query.isFetching}
							className="rounded-md border border-distinct px-3 py-2 text-primary hover:bg-alt aria-disabled:opacity-40"
						>
							Previous
						</Link>
						<span
							className="px-2 text-secondary tabular-nums"
							aria-live="polite"
						>
							Page {search.page}
						</span>
						<Link
							to="/fee-amm"
							search={{ ...search, page: Math.min(maxPage, search.page + 1) }}
							resetScroll={false}
							disabled={
								!query.data?.hasMore ||
								query.isFetching ||
								query.isError ||
								search.page >= maxPage
							}
							className="rounded-md border border-distinct px-3 py-2 text-primary hover:bg-alt aria-disabled:opacity-40"
						>
							Next
						</Link>
					</div>
					<label className="flex items-center gap-2 text-xs text-secondary">
						Pools per page
						<select
							aria-label="Pools per page"
							value={search.limit}
							onChange={(event) =>
								void navigate({
									search: {
										...search,
										page: 1,
										limit: Number(event.target.value) as 10 | 25 | 50,
									},
									resetScroll: false,
								})
							}
							className="rounded-md border border-distinct bg-card px-2 py-2 text-primary"
						>
							{[10, 25, 50].map((limit) => (
								<option key={limit} value={limit}>
									{limit}
								</option>
							))}
						</select>
					</label>
				</nav>
				{search.page >= maxPage && query.data?.hasMore && (
					<p className="px-4 pb-4 text-sm text-secondary">
						Showing the first 10,000 pools. Filter by token address to narrow
						the results.
					</p>
				)}
			</div>
			<p className="text-xs text-tertiary">
				USD estimates assume USD-denominated tokens trade at par. Pool reserves
				do not guarantee fee payment: token policies and the validator’s fee
				token also apply.
			</p>
		</div>
	)
}
