import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { DataGrid } from '#components/ui/DataGrid'
import { Sections } from '#components/ui/Sections'
import {
	FormattedTimestamp,
	TimeColumnHeader,
	useTimeFormat,
} from '#components/ui/TimeFormat'
import { HexFormatter } from '#lib/formatting'
import { useMediaQuery } from '#lib/hooks'
import { fetchTokens, type Token } from '#lib/server/tokens.server'

const TOKENS_PER_PAGE = 12

function tokensQueryOptions(params: { page: number; limit: number }) {
	const offset = (params.page - 1) * params.limit
	return queryOptions({
		queryKey: ['tokens', params.page, params.limit],
		queryFn: () => fetchTokens({ data: { offset, limit: params.limit } }),
		placeholderData: keepPreviousData,
	})
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
			tokensQueryOptions({ page: 1, limit: TOKENS_PER_PAGE }),
		)
	},
})

function TokensPage() {
	const { page = 1 } = Route.useSearch()
	const loaderData = Route.useLoaderData()
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()

	const { data, isLoading } = useQuery({
		...tokensQueryOptions({ page, limit: TOKENS_PER_PAGE }),
		initialData: page === 1 ? loaderData : undefined,
	})

	const tokens = data?.tokens ?? []
	const total = data?.total ?? 0

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
						totalItems: total,
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
												className="text-base-content-positive font-medium"
											>
												{token.symbol}
											</span>,
											<span key="name" className="truncate">
												{token.name}
											</span>,
											<span key="currency" className="text-secondary">
												{token.currency}
											</span>,
											<span
												key="address"
												className="text-accent truncate"
												title={token.address}
											>
												{HexFormatter.shortenHex(token.address, 8)}
											</span>,
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
								totalItems={total}
								page={page}
								isPending={isLoading}
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
