import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from '@tanstack/react-router'
import { Button } from '@tempoxyz/ds/platform'
import * as Address from 'ox/Address'
import { useId, useState } from 'react'
import type * as React from 'react'
import { cx } from 'zyzz'
import { FeeAmmPoolList, FeeAmmQueryState } from '#comps/FeeAmmPools'
import { CopyButton } from '#comps/CopyButton'
import { Pagination } from '#comps/Pagination'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { FEE_AMM_MAX_ROWS, feeAmmSearchSchema } from '#lib/fee-amm'
import { PriceFormatter } from '#lib/formatting'
import { link, linkHover, transitionColors } from '#styles/explorer'
import ArrowRightIcon from '~icons/lucide/arrow-right'
import XIcon from '~icons/lucide/x'
import { feeAmmPoolsQueryOptions } from '#lib/queries/fee-amm'
import { styles } from './-fee-amm.styles'

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
				{...cx(link(), linkHover())}
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
								{...cx(styles.filteredAddress(), link(), linkHover())}
							>
								{search.token}
							</Link>
						</div>
					)}
				</div>
				<CopyButton
					value={() => window.location.href}
					ariaLabel="Copy link"
					className={styles.copyLink().className}
				>
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
					<label htmlFor={filterId} {...styles.label()}>
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
						{...cx(styles.input(), transitionColors())}
					/>
				</div>
				<Button type="submit" variant="secondary">
					Find pools <ArrowRightIcon {...styles.buttonIcon()} />
				</Button>
				{search.token && (
					<Link
						to="/fee-amm"
						search={{ page: 1, limit: search.limit }}
						onClick={() => setFilterError(undefined)}
						{...cx(styles.clear(), link(), linkHover())}
					>
						<XIcon {...styles.icon()} /> Clear filter
					</Link>
				)}
				{filterError && (
					<p id={errorId} role="alert" {...styles.filterError()}>
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
									<div {...styles.summaryNote()}>
										<p {...styles.meta()}>
											Most active first · Reserves shown in each token’s units
										</p>
									</div>
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
									<label {...styles.limit()}>
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
											{...styles.select()}
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
