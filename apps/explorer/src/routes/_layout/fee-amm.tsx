import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
	useLocation,
} from '@tanstack/react-router'
import {
	Amount,
	Button,
	CopyButton,
	Field,
	Input,
	Select,
	Token,
	style,
} from '@tempoxyz/ds'
import { ArrowRight, Close } from '@tempoxyz/ds/icons'
import * as Address from 'ox/Address'
import { useState } from 'react'
import type * as React from 'react'
import { cx } from 'zyzz'
import { Address as AddressLink } from '#comps/Address'
import {
	FeeAmmEmpty,
	FeeAmmPoolList,
	FeeAmmQueryState,
} from '#comps/FeeAmmPools'
import { Pagination } from '#comps/Pagination'
import { Sections } from '#comps/Sections'
import { FEE_AMM_MAX_ROWS, feeAmmSearchSchema } from '#lib/fee-amm'
import { feeAmmPoolsQueryOptions } from '#lib/queries/fee-amm'
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
	const navigate = Route.useNavigate()
	const href = useLocation({ select: (location) => location.href })
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
								<Token address={search.token} size="small" />
								Filtered by {symbol ?? 'token'}
							</span>
							<AddressLink address={search.token} search={{ tab: 'token' }} />
						</div>
					)}
				</div>
				<CopyButton
					aria-label="Copy link"
					size="medium"
					value={
						typeof window === 'undefined'
							? href
							: new URL(href, window.location.origin).href
					}
					variant="secondary"
				/>
			</div>

			<form
				key={search.token ?? 'all'}
				onSubmit={(event) => {
					event.preventDefault()
					const value = String(
						new FormData(event.currentTarget).get('token') ?? '',
					).trim()
					if (value && !Address.validate(value)) {
						setFilterError(
							'Enter a token contract address that starts with 0x.',
						)
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
				<Field.Root invalid={Boolean(filterError)}>
					<Field.Label>Find pools by token address</Field.Label>
					<div {...styles.inputRow()}>
						<Input.Group {...styles.input()}>
							<Input.Control
								name="token"
								defaultValue={search.token ?? ''}
								placeholder="0x…"
								autoCapitalize="off"
								autoComplete="off"
								autoCorrect="off"
								spellCheck={false}
							/>
						</Input.Group>
						<Button type="submit" variant="secondary">
							Find pools
							<ArrowRight />
						</Button>
						{search.token && (
							<Button.Link
								render={
									<Link
										to="/fee-amm"
										search={{ page: 1, limit: search.limit }}
										onClick={() => setFilterError(undefined)}
									/>
								}
								variant="text"
							>
								<Close />
								Clear filter
							</Button.Link>
						)}
					</div>
					<Field.Error match={Boolean(filterError)}>{filterError}</Field.Error>
				</Field.Root>
			</form>

			<Sections
				sections={[
					{
						title: 'Liquidity pools',
						contextual: query.data && pools.length > 0 && (
							<span {...styles.total()}>
								<span {...styles.meta()}>Estimated liquidity</span>
								{liquidity === null ? (
									<span {...styles.meta()}>Unavailable</span>
								) : (
									<Amount currency="USD" value={liquidity} />
								)}
							</span>
						),
						content: (
							<div {...styles.content()}>
								<FeeAmmQueryState query={query} />
								{query.data &&
									(pools.length > 0 ? (
										<FeeAmmPoolList pools={pools} token={search.token} />
									) : (
										!query.isError && (
											<FeeAmmEmpty
												{...(search.page > 1
													? {
															title: 'No more pools',
															description:
																'Every pool appears on the earlier pages.',
														}
													: search.token
														? {
																title: 'No Fee AMM pools for this token',
																description:
																	'Pools appear here once liquidity is added for this token.',
															}
														: {
																title: 'No Fee AMM pools',
																description:
																	'Pools appear here once liquidity is added.',
															})}
											/>
										)
									))}
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
											showPageLabel={false}
										/>
										<span {...styles.pageLabel()} aria-live="polite">
											Page {search.page}
										</span>
									</div>
									<Field.Root variant="setting" size="small">
										<Field.Label>Pools per page</Field.Label>
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
											<Select.Trigger size="small" {...styles.limit()}>
												<Select.Value />
												<Select.Icon />
											</Select.Trigger>
											<Select.Popup size="small">
												{limits.map((limit) => (
													<Select.Item key={limit} value={limit}>
														<Select.ItemText>{limit}</Select.ItemText>
													</Select.Item>
												))}
											</Select.Popup>
										</Select.Root>
									</Field.Root>
								</nav>
								{search.page >= maxPage && query.data?.hasMore && (
									<p {...styles.meta()}>
										Showing the first 10,000 pools. Filter by token address to
										narrow the results.
									</p>
								)}
							</div>
						),
					},
				]}
			/>
			<p {...styles.footnote()}>
				Most active pools first. Reserves are in each token’s own units. USD
				estimates assume USD-denominated tokens trade at par. Pool reserves do
				not guarantee fee payment: token policies and the validator’s fee token
				also apply.
			</p>
		</div>
	)
}

const limits = [10, 25, 50] as const

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
		color: 'foreground',
		typography: 'heading.20.subtle',
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
		minWidth: '0',
	})

	export const title = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'flex',
		gap: '12',
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
		gap: '8',
		minWidth: '0',
		typography: 'copy.14',
	})

	export const filteredToken = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'inline-flex',
		gap: '8',
	})

	export const inputRow = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
	})

	export const input = style({ flex: 1, minWidth: '220px !custom' })

	export const meta = style({
		color: 'gray.900',
		typography: 'label.13',
	})

	export const total = style({
		alignItems: 'baseline',
		display: 'inline-flex',
		gap: '8',
		typography: 'label.14.strong',
	})

	export const content = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
	})

	export const pagination = style({
		alignItems: 'center',
		borderColor: 'grayAlpha.200',
		borderTopWidth: '1px',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '16',
		justifyContent: 'space-between',
		paddingTop: '12',
	})

	export const pager = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const pageLabel = style({
		color: 'gray.900',
		fontVariantNumeric: 'tabular-nums',
		paddingInline: '8',
		typography: 'label.13',
	})

	// Sized to its value, per the Select docs.
	export const limit = style({ width: '96' })

	export const footnote = style({
		color: 'gray.900',
		typography: 'label.12',
	})
}
