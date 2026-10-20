import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from '@tanstack/react-router'
import { Button, Field, Input, Select, style } from '@tempoxyz/ds'
import { AlertCircle, ArrowRight, Close } from '@tempoxyz/ds/icons'
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
				<Field.Root invalid={Boolean(filterError)} {...styles.field()}>
					<Field.Label>Find pools by token address</Field.Label>
					<Input.Group>
						<Input.Control
							name="token"
							defaultValue={search.token ?? ''}
							placeholder="0x…"
							spellCheck={false}
							autoComplete="off"
							aria-describedby={filterError ? errorId : undefined}
						/>
					</Input.Group>
				</Field.Root>
				<Button type="submit" variant="secondary">
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
										<Select.Root
											value={search.limit}
											onValueChange={(limit) => {
												if (limit === null) return
												void navigate({
													search: { ...search, page: 1, limit },
													resetScroll: false,
												})
											}}
										>
											<span {...styles.limitSelect()}>
												<Select.Trigger id={limitId} size="small">
													<Select.Value />
													<Select.Icon />
												</Select.Trigger>
											</span>
											<Select.Popup size="small">
												{limits.map((limit) => (
													<Select.Item key={limit} value={limit}>
														<Select.ItemText>{limit}</Select.ItemText>
													</Select.Item>
												))}
											</Select.Popup>
										</Select.Root>
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

const limits = [10, 25, 50] as const

namespace styles {
	export const error = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '3',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingInline: '4',
		paddingTop: '16',
	})

	export const errorTitle = style({
		color: 'foreground',
		typography: 'heading.20.subtle',
	})

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

	export const header = style({
		alignItems: 'flex-start',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '4',
		justifyContent: 'space-between',
	})

	export const intro = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '3',
		minWidth: '0px !custom',
	})

	export const title = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'flex',
		gap: '3',
		typography: 'heading.32.subtle',
	})

	export const description = style({
		color: 'gray.900',
		maxWidth: '680px !custom',
		typography: 'copy.14',
	})

	export const filtered = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
		typography: 'copy.14',
	})

	export const filteredToken = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'inline-flex',
		gap: '2',
	})

	export const form = style({
		alignItems: 'flex-end',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '3',
	})

	// Touch devices keep 16px text so iOS does not zoom on focus.
	export const field = style({
		flex: 1,
		minWidth: '220px !custom',
		'@media (pointer: coarse)': {
			selectors: { '& input': { fontSize: '16px !custom' } },
		},
	})

	// TDS Button leaves icon size to the icon.
	export const buttonIcon = style({ height: '4', width: '4' })

	export const filterError = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'flex',
		gap: '1',
		typography: 'copy.14',
		width: '100% !custom',
	})

	export const filterErrorIcon = style({
		color: 'red.900',
		flexShrink: 0,
	})

	export const summary = style({
		alignItems: 'center',
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'dashed',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '4',
		justifyContent: 'space-between',
		paddingBlock: '3',
		paddingInline: '4',
	})

	export const meta = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const total = style({ textAlign: 'right' })

	export const totalValue = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums',
		typography: 'copy.14',
	})

	export const empty = style({
		color: 'gray.900',
		paddingBlock: '10',
		paddingInline: '4',
		textAlign: 'center',
		typography: 'copy.14',
	})

	export const pagination = style({
		alignItems: 'center',
		borderColor: 'grayAlpha.200',
		borderStyle: 'dashed',
		borderTopWidth: '1px',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '4',
		justifyContent: 'space-between',
		paddingBlock: '3',
		paddingInline: '4',
		typography: 'copy.14',
	})

	export const pager = style({
		alignItems: 'center',
		display: 'flex',
		gap: '2',
	})

	export const pageLabel = style({
		color: 'gray.900',
		fontVariantNumeric: 'tabular-nums',
		paddingInline: '2',
	})

	export const limit = style({
		alignItems: 'center',
		display: 'flex',
		gap: '2',
	})

	export const limitLabel = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	// The Select trigger fills its container.
	export const limitSelect = style({ display: 'flex', width: '96px !custom' })

	export const capped = style({
		color: 'gray.900',
		paddingBottom: '4',
		paddingInline: '4',
		typography: 'copy.14',
	})

	export const footnote = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const filteredAddress = style({
		typography: 'label.12.mono',
		wordBreak: 'break-all',
	})

	export const clearFilter = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '2',
		paddingBlock: '2',
		typography: 'copy.14',
	})
}
