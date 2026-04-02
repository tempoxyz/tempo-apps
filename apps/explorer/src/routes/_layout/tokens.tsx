import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import * as z from 'zod/mini'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import {
	FormattedTimestamp,
	TimeColumnHeader,
	useTimeFormat,
} from '#comps/TimeFormat'
import { TokenIcon } from '#comps/TokenIcon'
import { useMediaQuery } from '#lib/hooks'
import { withLoaderTiming } from '#lib/profiling'
import { TOKENS_PER_PAGE, tokensListQueryOptions } from '#lib/queries'
import type { Token } from '#lib/server/tokens'
import { OG_BASE_URL } from '#lib/og'

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
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
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
			const formatted = holdersCountFormatter.format(token.holdersCount)
			return token.holdersCountCapped ? `> ${formatted}` : formatted
		},
		[holdersCountFormatter],
	)

	const prefetchNextPage = React.useCallback(() => {
		const nextPage = page + 1
		if (nextPage > Math.ceil(total / TOKENS_PER_PAGE)) return

		void queryClient
			.prefetchQuery(
				tokensListQueryOptions({
					page: nextPage,
					limit: TOKENS_PER_PAGE,
				}),
			)
			.catch(() => {})
	}, [total, page, queryClient])

	const columns: DataGrid.Column[] = [
		{
			label: 'Token',
			align: 'start',
			width: 120,
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
			align: 'start',
			width: 110,
		},
		{
			label: 'Address',
			align: 'start',
			width: '3fr' as const,
			minWidth: 200,
		},
		{
			label: (
				<TimeColumnHeader
					label="Created"
					formatLabel={formatLabel}
					onCycle={cycleTimeFormat}
					className="text-secondary hover:text-accent cursor-pointer transition-colors"
				/>
			),
			align: 'end',
			width: 170,
		},
	]

	return (
		<div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-[1200px] mx-auto w-full">
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
								columns={{ stacked: columns, tabs: columns }}
								items={() =>
									tokens.map((token: Token) => ({
										cells: [
											<span
												key="symbol"
												className="inline-flex items-center gap-2 text-base-content-positive font-medium"
											>
												<TokenIcon
													address={token.address}
													name={token.symbol}
												/>
												{token.symbol}
											</span>,
											<span key="name" className="truncate max-w-[40ch]">
												{token.name}
											</span>,
											<span key="currency" className="text-secondary">
												{token.currency}
											</span>,
											<span key="holders" className="text-secondary">
												{formatHoldersCount(token)}
											</span>,
											<Address
												key="address"
												address={token.address}
												className="w-full"
											/>,
											token.createdAt == null ? (
												<span
													key="created"
													className="text-secondary whitespace-nowrap"
												>
													-
												</span>
											) : (
												<FormattedTimestamp
													key="created"
													timestamp={BigInt(token.createdAt)}
													format={timeFormat}
													className="text-secondary whitespace-nowrap"
												/>
											),
										],
										link: {
											href: `/token/${token.address}`,
											title: `View token ${token.symbol}`,
										},
									}))
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
