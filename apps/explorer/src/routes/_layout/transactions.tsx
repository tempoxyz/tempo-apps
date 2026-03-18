import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { Hex } from 'ox'
import * as React from 'react'
import * as z from 'zod/mini'
import { AddressCell } from '#comps/AddressCell'
import { DataGrid } from '#comps/DataGrid'
import { Midcut } from '#comps/Midcut'
import { Sections } from '#comps/Sections'
import {
	FormattedTimestamp,
	TimeColumnHeader,
	useTimeFormat,
} from '#comps/TimeFormat'
import { syncBlockNumberAtLeast, useLiveBlockNumber } from '#lib/block-number'
import { withLoaderTiming } from '#lib/profiling'
import { BLOCKS_PER_TX_PAGE, blockTransactionsQueryOptions } from '#lib/queries'
import ChevronFirst from '~icons/lucide/chevron-first'
import ChevronLast from '~icons/lucide/chevron-last'
import ChevronLeft from '~icons/lucide/chevron-left'
import ChevronRight from '~icons/lucide/chevron-right'
import Play from '~icons/lucide/play'

export const Route = createFileRoute('/_layout/transactions')({
	component: RouteComponent,
	head: () => ({
		meta: [{ title: 'Transactions – Tempo Explorer' }],
	}),
	validateSearch: z.object({
		from: z.optional(z.coerce.number()),
		live: z.optional(z.coerce.boolean()),
	}),
	loaderDeps: ({ search: { from, live } }) => ({
		from,
		live: live ?? from == null,
	}),
	loader: ({ deps, context }) =>
		withLoaderTiming('/_layout/transactions', async () =>
			context.queryClient.ensureQueryData(
				blockTransactionsQueryOptions(deps.from),
			),
		),
})

function RouteComponent() {
	const search = Route.useSearch()
	const from = search.from
	const isAtLatest = from == null
	const live = search.live ?? isAtLatest
	const loaderData = Route.useLoaderData()

	const { data: queryData } = useQuery({
		...blockTransactionsQueryOptions(from),
		initialData: loaderData,
	})

	const [latestBlockNumber, setLatestBlockNumber] = React.useState<
		bigint | undefined
	>()
	const currentLatest = latestBlockNumber ?? queryData.latestBlockNumber

	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
	const [paused, setPaused] = React.useState(false)
	const liveBlockNumber = useLiveBlockNumber()
	const lastHandledBlockRef = React.useRef<bigint | null>(null)
	const { refetch } = useQuery(blockTransactionsQueryOptions(from))

	React.useEffect(() => {
		syncBlockNumberAtLeast(queryData.latestBlockNumber)
	}, [queryData.latestBlockNumber])

	React.useEffect(() => {
		if (liveBlockNumber == null) return
		if (lastHandledBlockRef.current === liveBlockNumber) return
		lastHandledBlockRef.current = liveBlockNumber

		if (liveBlockNumber > (latestBlockNumber ?? queryData.latestBlockNumber)) {
			setLatestBlockNumber(liveBlockNumber)
		}

		if (!live || !isAtLatest || paused) return
		refetch()
	}, [
		liveBlockNumber,
		latestBlockNumber,
		queryData.latestBlockNumber,
		live,
		isAtLatest,
		paused,
		refetch,
	])

	const transactions = queryData.transactions
	const isLoading = !transactions || transactions.length === 0

	const columns: DataGrid.Column[] = [
		{ label: 'Hash', width: '4fr', minWidth: 100 },
		{ label: 'Block', width: '1fr', minWidth: 80 },
		{ label: 'From', width: '3fr', minWidth: 100 },
		{ label: 'To', width: '3fr', minWidth: 100 },
		{
			align: 'end',
			label: (
				<TimeColumnHeader
					label="Time"
					formatLabel={formatLabel}
					onCycle={cycleTimeFormat}
				/>
			),
			width: '1fr',
			minWidth: 80,
		},
	]

	return (
		<div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-300 mx-auto w-full">
			<Sections
				mode="tabs"
				sections={[
					{
						title: 'Transactions',
						autoCollapse: false,
						contextual: (
							<Link
								to="."
								resetScroll={false}
								search={(prev) => ({
									...prev,
									live: isAtLatest
										? !live
											? undefined
											: false
										: !live
											? true
											: undefined,
								})}
								className={`flex items-center gap-[4px] px-[6px] py-[2px] rounded-[4px] text-[11px] font-medium press-down ${
									live && !paused
										? 'bg-positive/10 text-positive hover:bg-positive/20'
										: 'bg-base-alt text-tertiary hover:bg-base-alt/80'
								}`}
								title={live ? 'Pause live updates' : 'Resume live updates'}
							>
								{live && !paused ? (
									<>
										<span className="relative flex size-2">
											<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
											<span className="relative inline-flex rounded-full size-2 bg-positive" />
										</span>
										<span>Live</span>
									</>
								) : (
									<>
										<Play className="size-3" />
										<span>Paused</span>
									</>
								)}
							</Link>
						),
						content: (
							// biome-ignore lint/a11y/noStaticElementInteractions: pause on hover
							<div
								onMouseEnter={() => setPaused(true)}
								onMouseLeave={() => setPaused(false)}
								onFocusCapture={() => setPaused(true)}
								onBlurCapture={(e) => {
									if (!e.currentTarget.contains(e.relatedTarget as Node)) {
										setPaused(false)
									}
								}}
							>
								<DataGrid
									columns={{ stacked: columns, tabs: columns }}
									items={() =>
										transactions.map((tx) => ({
											cells: [
												<Midcut
													key="hash"
													value={tx.hash as string}
													prefix="0x"
												/>,
												<Link
													key="block"
													to="/block/$id"
													params={{ id: tx.blockNumber.toString() }}
													className="text-accent tabular-nums font-medium"
												>
													#{tx.blockNumber.toString()}
												</Link>,
												<TxAddress
													key="from"
													address={tx.from as Hex.Hex}
													label="From"
												/>,
												<TxAddress
													key="to"
													address={(tx.to as Hex.Hex) ?? null}
													label="To"
												/>,
												<span
													key="time"
													className="text-secondary tabular-nums whitespace-nowrap"
												>
													<FormattedTimestamp
														timestamp={tx.blockTimestamp}
														format={timeFormat}
													/>
												</span>,
											],
											link: {
												href: `/receipt/${tx.hash}`,
												title: `View transaction ${tx.hash}`,
											},
										}))
									}
									totalItems={transactions.length}
									page={1}
									loading={isLoading}
									itemsLabel="transactions"
									itemsPerPage={BLOCKS_PER_TX_PAGE * 10}
									emptyState="No transactions found."
									pagination={
										<TxPagination
											startBlock={queryData.startBlock}
											endBlock={queryData.endBlock}
											latestBlockNumber={currentLatest}
											isAtLatest={isAtLatest}
											txCount={transactions.length}
										/>
									}
								/>
							</div>
						),
					},
				]}
				activeSection={0}
			/>
		</div>
	)
}

function TxAddress({
	address,
	label,
}: {
	address: Hex.Hex | null
	label: string
}) {
	if (!address) {
		return (
			<span className="text-tertiary text-[12px] italic">
				Contract creation
			</span>
		)
	}
	return <AddressCell address={address} label={label} />
}

function TxPagination({
	startBlock,
	endBlock,
	latestBlockNumber,
	isAtLatest,
	txCount,
}: {
	startBlock: bigint
	endBlock: bigint
	latestBlockNumber: bigint | undefined
	isAtLatest: boolean
	txCount: number
}) {
	const canGoNewer = !isAtLatest
	const canGoOlder = endBlock > 0n

	const newerFrom =
		Number(startBlock) + BLOCKS_PER_TX_PAGE <=
		Number(latestBlockNumber ?? startBlock)
			? Number(startBlock) + BLOCKS_PER_TX_PAGE
			: undefined
	const olderFrom = endBlock > 0n ? Number(endBlock) - 1 : undefined

	return (
		<div className="flex flex-col items-center sm:flex-row sm:justify-between gap-[12px] border-t border-dashed border-card-border px-[16px] py-[12px] text-[12px] text-tertiary">
			<div className="flex items-center justify-center sm:justify-start gap-[6px]">
				<Link
					to="."
					resetScroll={false}
					search={{ from: undefined, live: undefined }}
					disabled={!canGoNewer}
					className="rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 size-[24px] text-primary"
					title="Latest transactions"
				>
					<ChevronFirst className="size-[14px]" />
				</Link>
				<Link
					to="."
					resetScroll={false}
					search={{ from: newerFrom, live: undefined }}
					disabled={!canGoNewer}
					className="rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 size-[24px] text-primary"
					title="Newer transactions"
				>
					<ChevronLeft className="size-[14px]" />
				</Link>
				<span className="text-primary font-medium tabular-nums px-[4px] whitespace-nowrap">
					{`Blocks #${endBlock}–#${startBlock}`}
				</span>
				<Link
					to="."
					resetScroll={false}
					search={{ from: olderFrom, live: undefined }}
					disabled={!canGoOlder}
					className="rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 size-[24px] text-primary"
					title="Older transactions"
				>
					<ChevronRight className="size-[14px]" />
				</Link>
				<Link
					to="."
					resetScroll={false}
					search={{ from: BLOCKS_PER_TX_PAGE - 1, live: undefined }}
					disabled={endBlock === 0n}
					className="rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 size-[24px] text-primary"
					title="Oldest transactions"
				>
					<ChevronLast className="size-[14px]" />
				</Link>
			</div>
			<span className="tabular-nums">
				{txCount} txns from {BLOCKS_PER_TX_PAGE} blocks
			</span>
		</div>
	)
}
