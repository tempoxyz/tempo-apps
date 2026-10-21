import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { style, Token as TokenLogo } from '@tempoxyz/ds'
import * as React from 'react'
import { cx } from 'zyzz'
import * as z from 'zod/mini'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import { PREFETCH_PAGE_COUNT } from '#lib/constants'
import { resolveLogoURI } from '#lib/domain/tip20'
import { useMediaQuery } from '#lib/hooks'
import { TOKENS_PER_PAGE, tokensListQueryOptions } from '#lib/queries'
import type { Token } from '#lib/server/tokens'
import { OG_BASE_URL } from '#lib/og'
import { truncate } from '#styles/explorer'

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
	}),
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			tokensListQueryOptions({
				page: 1,
				limit: TOKENS_PER_PAGE,
			}),
		),
})

function TokensPage() {
	const { page = 1 } = Route.useSearch()
	const loaderData = Route.useLoaderData()
	const queryClient = useQueryClient()

	const { data, isPending } = useQuery({
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
		{ label: 'Token', align: 'start', width: '2fr' },
		{ label: 'Currency', align: 'start', width: 100 },
		{ label: 'Holders', align: 'end', width: 120 },
		{ label: 'Contract', align: 'end', width: '1fr' },
	]
	const stackedColumns: DataGrid.Column[] = [
		{ label: 'Token', align: 'start', width: '1fr' },
		{ label: 'Holders', align: 'end', width: 'max-content' },
	]

	return (
		<div {...styles.page()}>
			<Sections
				mode={mode}
				sections={[
					{
						title: 'Tokens',
						content: (
							<DataGrid
								columns={{ stacked: stackedColumns, tabs: columns }}
								items={(gridMode) =>
									tokens.map((token: Token) => {
										// TDS Tables and Lists: the token icon beside its symbol, with the name beneath.
										const tokenCell = (
											<span key="token" {...styles.token()}>
												<TokenLogo
													address={token.address}
													size="medium"
													src={resolveLogoURI(token.logoURI)}
												/>
												<span {...styles.tokenText()}>
													<span {...cx(truncate(), styles.symbol())}>
														{token.symbol}
													</span>
													<span {...cx(truncate(), styles.secondary())}>
														{gridMode === 'stacked'
															? `${token.name} · ${token.currency}`
															: token.name}
													</span>
												</span>
											</span>
										)
										const holders = (
											<span key="holders" {...styles.numeric()}>
												{formatHoldersCount(token)}
											</span>
										)

										return {
											cells:
												gridMode === 'stacked'
													? [tokenCell, holders]
													: [
															tokenCell,
															<span key="currency" {...styles.secondary()}>
																{token.currency}
															</span>,
															holders,
															<Address
																key="address"
																address={token.address}
																align="end"
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

namespace styles {
	export const page = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '24',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingBottom: '64',
		paddingInline: '16',
		paddingTop: '64',
		width: '100% !custom',
	})

	export const token = style({
		alignItems: 'center',
		display: 'flex',
		gap: '12',
		minWidth: '0 !custom',
	})

	export const tokenText = style({
		display: 'flex',
		flexDirection: 'column',
		minWidth: '0 !custom',
	})

	export const symbol = style({
		color: 'foreground',
		typography: 'label.14.strong',
	})

	export const secondary = style({ color: 'gray.900', typography: 'copy.13' })

	export const numeric = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums',
	})
}
