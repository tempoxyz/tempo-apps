import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from '@tanstack/react-router'
import { Button, NativeSelect, TextInput } from '@tempoxyz/ds/platform'
import { AlertCircle, ArrowRight, Close } from '@tempoxyz/ds/platform/icons'
import * as Address from 'ox/Address'
import { useId, useState } from 'react'
import type * as React from 'react'
import { FeeAmmPoolList, FeeAmmQueryState } from '#comps/FeeAmmPools'
import { CopyButton } from '#comps/CopyButton'
import { Pagination } from '#comps/Pagination'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { FEE_AMM_MAX_ROWS, feeAmmSearchSchema } from '#lib/fee-amm'
import { PriceFormatter } from '#lib/formatting'
import { feeAmmPoolsQueryOptions } from '#lib/queries/fee-amm'
import { composed, styles } from './-fee-amm.styles'

export const Route = createFileRoute('/_layout/fee-amm')({
	component: FeeAmmPage,
	errorComponent: () => (
		<div {...styles.error()}>
			<h1 {...styles.errorTitle()}>Invalid Fee AMM link</h1>
			<p {...styles.description()}>
				Check the token address and page number, or start from all pools.
			</p>
			<Link
				to="/fee-amm"
				search={{ page: 1, limit: 10 }}
				{...composed.textLink}
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
	const errorId = useId()
	const limitId = useId()
	const navigate = Route.useNavigate()
	const query = useQuery(feeAmmPoolsQueryOptions(search))
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
		<div {...styles.page()}>
			<div {...styles.header()}>
				<div {...styles.intro()}>
					<h1 {...styles.title()}>Fee AMM</h1>
					<p {...styles.description()}>
						Liquidity that converts transaction fees into a validator’s
						preferred token. Each pool has a fee token and a validator token.
					</p>
					{search.token && (
						<div {...styles.filtered()}>
							<span {...styles.filteredToken()}>
								<TokenIcon address={search.token} />
								Filtered by {symbol ?? 'token'}
							</span>
							<Link
								to="/address/$address"
								params={{ address: search.token }}
								search={{ tab: 'token' }}
								{...composed.filteredAddressLink}
							>
								{search.token}
							</Link>
						</div>
					)}
				</div>
				<CopyButton value={() => window.location.href} ariaLabel="Copy link">
					Copy link
				</CopyButton>
			</div>

			<form
				key={search.token ?? 'all'}
				{...styles.form()}
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
				<div {...styles.field()}>
					<TextInput
						label="Find pools by token address"
						name="token"
						defaultValue={search.token ?? ''}
						placeholder="0x…"
						spellCheck={false}
						autoComplete="off"
						aria-invalid={Boolean(filterError)}
						aria-describedby={filterError ? errorId : undefined}
						className={styles.control().className}
					/>
				</div>
				<Button type="submit" scale="large" variant="secondary">
					Find pools <ArrowRight {...styles.buttonIcon()} />
				</Button>
				{search.token && (
					<Link
						to="/fee-amm"
						search={{ page: 1, limit: search.limit }}
						onClick={() => setFilterError(undefined)}
						{...composed.clearFilterLink}
					>
						<Close /> Clear filter
					</Link>
				)}
				{filterError && (
					<p id={errorId} role="alert" {...styles.filterError()}>
						<AlertCircle {...styles.filterErrorIcon()} />
						{filterError}
					</p>
				)}
			</form>

			<Sections
				sections={[
					{
						title: 'Liquidity pools',
						content: (
							<>
								<div {...styles.summary()}>
									<p {...styles.meta()}>
										Most active first · Reserves shown in each token’s units
									</p>
									{query.data && pools.length > 0 && (
										<div {...styles.total()}>
											<div {...styles.totalValue()}>
												{liquidity === null
													? 'Unavailable'
													: PriceFormatter.format(liquidity)}
											</div>
											<div {...styles.meta()}>
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
											<div {...styles.empty()}>
												{search.page > 1
													? 'No more pools on this page.'
													: search.token
														? 'No Fee AMM pools found for this token.'
														: 'No Fee AMM pools found.'}
											</div>
										)}
									</>
								)}
								<nav aria-label="Fee AMM pagination" {...styles.pagination()}>
									<div {...styles.pager()}>
										<Pagination.Simple
											page={search.page}
											pages={{
												hasMore:
													Boolean(query.data?.hasMore) &&
													!query.isFetching &&
													!query.isError &&
													search.page < maxPage,
											}}
											fetching={query.isFetching}
											showPageLabel={false}
										/>
										<span {...styles.pageLabel()} aria-live="polite">
											Page {search.page}
										</span>
									</div>
									<div {...styles.limit()}>
										<label htmlFor={limitId} {...styles.limitLabel()}>
											Pools per page
										</label>
										<NativeSelect
											id={limitId}
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
											style={{ width: 96 }}
										>
											{[10, 25, 50].map((limit) => (
												<option key={limit} value={limit}>
													{limit}
												</option>
											))}
										</NativeSelect>
									</div>
								</nav>
								{search.page >= maxPage && query.data?.hasMore && (
									<p {...styles.capped()}>
										Showing the first 10,000 pools. Filter by token address to
										narrow the results.
									</p>
								)}
							</>
						),
					},
				]}
			/>
			<p {...styles.footnote()}>
				USD estimates assume USD-denominated tokens trade at par. Pool reserves
				do not guarantee fee payment: token policies and the validator’s fee
				token also apply.
			</p>
		</div>
	)
}
