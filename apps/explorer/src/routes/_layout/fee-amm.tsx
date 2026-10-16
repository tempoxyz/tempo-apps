import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from '@tanstack/react-router'
import {
	Button,
	NativeSelect,
	style,
	TextInput,
	vars,
} from '@tempoxyz/ds/platform'
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
import { cx } from 'zyzz'
import { link, linkHover } from '#styles/explorer'

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
								{...cx(styles.filteredAddress(), link(), linkHover())}
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
						{...cx(styles.clearFilter(), link(), linkHover())}
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

namespace styles {
	export const error = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingInline: '16',
		paddingTop: '64',
	})

	export const errorTitle = style({
		color: 'content.primary',
		typography: 'heading.h3',
	})

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
		alignItems: 'flex-start',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '16',
		justifyContent: 'space-between',
	})

	export const intro = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		minWidth: '0px !custom',
	})

	export const title = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		gap: '12',
		typography: 'heading.h1',
	})

	export const description = style({
		color: 'content.secondary',
		maxWidth: '680px !custom',
		typography: 'body.b2',
	})

	export const filtered = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		typography: 'body.b2',
	})

	export const filteredToken = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'inline-flex',
		gap: '8',
	})

	export const form = style({
		alignItems: 'flex-end',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
	})

	// TextInput caps itself at 320px; addresses need the full row. Touch
	// devices keep 16px text so iOS does not zoom on focus.
	export const field = style({
		flex: 1,
		minWidth: '220px !custom',
		selectors: { '& > div': { width: '100% !custom' } },
		'@media (pointer: coarse)': {
			selectors: { '& input': { fontSize: '16px !custom' } },
		},
	})

	export const control = style({
		'::placeholder': { color: 'content.secondary' },
		selectors: {
			'&[aria-invalid="true"]': {
				boxShadow: `inset 0 0 0 1px ${vars.color.border.negative} !custom`,
			},
		},
	})

	// TDS Button sizes SVG children itself only in IconButton.
	export const buttonIcon = style({ height: '16', width: '16' })

	export const filterError = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		gap: '4',
		typography: 'body.b2',
		width: '100% !custom',
	})

	export const filterErrorIcon = style({
		color: 'content.negative',
		flexShrink: 0,
	})

	export const summary = style({
		alignItems: 'center',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'dashed',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '16',
		justifyContent: 'space-between',
		paddingBlock: '12',
		paddingInline: '16',
	})

	export const meta = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const total = style({ textAlign: 'right' })

	export const totalValue = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		typography: 'body.b2',
	})

	export const empty = style({
		color: 'content.secondary',
		paddingBlock: '40',
		paddingInline: '16',
		textAlign: 'center',
		typography: 'body.b2',
	})

	export const pagination = style({
		alignItems: 'center',
		borderColor: 'line.secondary',
		borderStyle: 'dashed',
		borderTopWidth: 'regular',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '16',
		justifyContent: 'space-between',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const pager = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const pageLabel = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
		paddingInline: '8',
	})

	export const limit = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const limitLabel = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const capped = style({
		color: 'content.secondary',
		paddingBottom: '16',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const footnote = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const filteredAddress = style({
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const clearFilter = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '8',
		paddingBlock: '8',
		typography: 'body.b2',
	})
}
