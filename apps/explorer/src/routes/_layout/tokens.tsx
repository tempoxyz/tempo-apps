import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { cx } from 'zyzz'
import * as z from 'zod/mini'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { PREFETCH_PAGE_COUNT } from '#lib/constants'
import { useMediaQuery } from '#lib/hooks'
import { withLoaderTiming } from '#lib/profiling'
import { TOKENS_PER_PAGE, tokensListQueryOptions } from '#lib/queries'
import type { Token } from '#lib/server/tokens'
import { OG_BASE_URL } from '#lib/og'
import { truncate } from '#styles/explorer'
import { styles } from './-tokens.styles'

export const Route = createFileRoute('/_layout/tokens')({
	component: TokensPage,
	head: () => ({
		meta: [
			{ title: 'Tokens – Tempo Explorer' },
			{ property: 'og:title', content: 'Tokens – Tempo Explorer' },
			{
				property: 'og:description',
				content: 'Browse all tokens on Tempo.',
			},
			{
				property: 'og:image',
				content: `${OG_BASE_URL}/tokens`,
			},
			{ property: 'og:image:type', content: 'image/webp' },
			{ property: 'og:image:width', content: '1200' },
			{ property: 'og:image:height', content: '630' },
			{ name: 'twitter:card', content: 'summary_large_image' },
			{ name: 'twitter:image', content: `${OG_BASE_URL}/tokens` },
		],
	}),
	validateSearch: z.object({
		page: z.optional(z.number()),
	}).parse,
	loader: ({ context }) =>
		withLoaderTiming('/_layout/tokens', async () =>
			context.queryClient.ensureQueryData(
				tokensListQueryOptions({
					page: 1,
					limit: TOKENS_PER_PAGE,
				}),
			),
		),
})

function TokensPage() {
	const { page = 1 } = Route.useSearch()
	const loaderData = Route.useLoaderData()
	const queryClient = useQueryClient()

	const { data, isPending, isFetching } = useQuery({
		...tokensListQueryOptions({
			page,
			limit: TOKENS_PER_PAGE,
		}),
		initialData: page === 1 ? loaderData : undefined,
	})

	const tokens = data?.tokens ?? []
	const total = data?.total ?? 0

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'
	const holdersCountFormatter = React.useMemo(
		() => new Intl.NumberFormat('en-US'),
		[],
	)

	const formatHoldersCount = React.useCallback(
		(token: Token) => {
			if (token.holdersCount === undefined) return '0'
			return holdersCountFormatter.format(token.holdersCount)
		},
		[holdersCountFormatter],
	)

	const prefetchNextPage = React.useCallback(() => {
		const lastPage = Math.ceil(total / TOKENS_PER_PAGE)
		for (let i = 1; i <= PREFETCH_PAGE_COUNT; i++) {
			const nextPage = page + i
			if (nextPage > lastPage) break

			void queryClient
				.prefetchQuery(
					tokensListQueryOptions({
						page: nextPage,
						limit: TOKENS_PER_PAGE,
					}),
				)
				.catch(() => {})
		}
	}, [total, page, queryClient])

	const columns: DataGrid.Column[] = [
		{
			label: 'Token',
			align: 'start',
			width: 'max-content',
		},
		{
			label: 'Name',
			align: 'start',
			width: '2fr',
			minWidth: 180,
		},
		{
			label: 'Currency',
			align: 'start',
			width: 110,
		},
		{
			label: 'Holders',
			align: 'end',
			width: 110,
		},
		{
			label: 'Address',
			align: 'end',
			width: '3fr' as const,
			minWidth: 200,
		},
	]
	const stackedColumns: DataGrid.Column[] = [
		{
			label: 'Token',
			align: 'start',
			width: '1fr',
			minWidth: 110,
		},
	]

	return (
		<div {...styles.page()}>
			<Sections
				mode={mode}
				sections={[
					{
						title: 'Tokens',
						totalItems: `${total}`,
						itemsLabel: 'tokens',
						autoCollapse: false,
						content: (
							<DataGrid
								columns={{ stacked: stackedColumns, tabs: columns }}
								items={(gridMode) =>
									tokens.map((token: Token) => {
										const tokenCell = (
											<div key="token" {...styles.tokenCell()}>
												<span {...styles.symbol()}>
													<TokenIcon
														address={token.address}
														name={token.symbol}
														logoURI={token.logoURI}
													/>
													<span {...truncate()} title={token.symbol}>
														{token.symbol}
													</span>
												</span>
												<span {...cx(truncate(), styles.secondary())}>
													{token.name}
												</span>
												<span {...styles.tertiary()}>
													{token.currency} · {formatHoldersCount(token)} holders
												</span>
											</div>
										)

										return {
											cells:
												gridMode === 'stacked'
													? [tokenCell]
													: [
															<span key="symbol" {...styles.symbol()}>
																<TokenIcon
																	address={token.address}
																	name={token.symbol}
																	logoURI={token.logoURI}
																/>
																{token.symbol}
															</span>,
															<span
																key="name"
																{...cx(truncate(), styles.name())}
															>
																{token.name}
															</span>,
															<span key="currency" {...styles.secondary()}>
																{token.currency}
															</span>,
															<span key="holders" {...styles.holders()}>
																{formatHoldersCount(token)}
															</span>,
															<Address
																key="address"
																address={token.address}
																align="end"
																className={styles.address().className}
															/>,
														],
											link: {
												href: `/token/${token.address}`,
												title: `View token ${token.symbol}`,
											},
										}
									})
								}
								totalItems={total}
								displayCount={total}
								displayCountCapped={false}
								page={page}
								fetching={isFetching && !isPending}
								loading={isPending}
								countLoading={false}
								itemsLabel="tokens"
								itemsPerPage={TOKENS_PER_PAGE}
								pagination="simple"
								onPrefetchNextPage={prefetchNextPage}
								emptyState="No tokens found."
							/>
						),
					},
				]}
				activeSection={0}
			/>
		</div>
	)
}
