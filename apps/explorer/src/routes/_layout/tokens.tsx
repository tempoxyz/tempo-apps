import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
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
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { useIsMounted, useMediaQuery } from '#lib/hooks'
import { TOKENS_PER_PAGE, tokensListQueryOptions } from '#lib/queries'
import type { Token } from '#lib/server/tokens.server'

async function fetchTokensCount() {
	const response = await fetch(`${__BASE_URL__}/api/tokens/count`, {
		headers: { 'Content-Type': 'application/json' },
	})
	if (!response.ok) throw new Error('Failed to fetch total token count')
	const { data, success, error } = z.safeParse(
		z.object({ data: z.number(), error: z.nullable(z.string()) }),
		await response.json(),
	)
	if (!success) throw new Error(z.prettifyError(error))
	return data
}

export const Route = createFileRoute('/_layout/tokens')({
	component: TokensPage,
	head: () => ({
		meta: [{ title: 'Tokens – Tempo Explorer' }],
	}),
	validateSearch: z.object({
		page: z.optional(z.number()),
	}).parse,
	loader: async ({ context }) => {
		return context.queryClient.ensureQueryData(
			tokensListQueryOptions({
				page: 1,
				limit: TOKENS_PER_PAGE,
				includeCount: false,
			}),
		)
	},
})

function TokensPage() {
	const { page = 1 } = Route.useSearch()
	const loaderData = Route.useLoaderData()
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
	const isMounted = useIsMounted()

	const { data, isPlaceholderData, isPending } = useQuery({
		...tokensListQueryOptions({
			page,
			limit: TOKENS_PER_PAGE,
			includeCount: false,
		}),
		initialData: page === 1 ? loaderData : undefined,
	})

	// Fetch count separately in the background
	const countQuery = useQuery({
		queryKey: ['tokens-count'],
		queryFn: fetchTokensCount,
		staleTime: 60_000,
		refetchInterval: false,
		refetchOnWindowFocus: false,
	})

	const tokens = data?.tokens ?? []
	const exactCount = isMounted ? countQuery.data?.data : undefined
	const paginationTotal = exactCount ?? TOKEN_COUNT_MAX
	const displayTotal = exactCount ?? '...'

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	const columns: DataGrid.Column[] = [
		{ label: 'Token', align: 'start', minWidth: 80 },
		{ label: 'Name', align: 'start' },
		{ label: 'Currency', align: 'start', minWidth: 80 },
		{ label: 'Address', align: 'start' },
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
			minWidth: 100,
		},
	]

	return (
		<div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<Sections
				mode={mode}
				sections={[
					{
						title: 'Tokens',
						totalItems: displayTotal,
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
											<Address key="address" address={token.address} />,
											<FormattedTimestamp
												key="created"
												timestamp={BigInt(token.createdAt)}
												format={timeFormat}
												className="text-secondary"
											/>,
										],
										link: {
											href: `/token/${token.address}`,
											title: `View token ${token.symbol}`,
										},
									}))
								}
								totalItems={paginationTotal}
								displayCount={exactCount}
								page={page}
								fetching={isPlaceholderData}
								loading={isPending}
								countLoading={!exactCount}
								itemsLabel="tokens"
								itemsPerPage={TOKENS_PER_PAGE}
								pagination="simple"
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
