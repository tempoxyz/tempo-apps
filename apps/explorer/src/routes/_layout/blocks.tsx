import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'
import type { Block } from 'viem'
import { useWatchBlockNumber } from 'wagmi'
import { getBlock } from 'wagmi/actions'
import * as z from 'zod/mini'
import { DataGrid } from '#comps/DataGrid'
import { Midcut } from '#comps/Midcut'
import { Sections } from '#comps/Sections'
import {
	FormattedTimestamp,
	TimeColumnHeader,
	useTimeFormat,
} from '#comps/TimeFormat'
import { cx } from '#lib/css'
import { calculateBlocksToFetch, mergeBlocks } from '#lib/live-blocks'
import { withLoaderTiming } from '#lib/profiling'
import { BLOCKS_PER_PAGE, blocksQueryOptions } from '#lib/queries'
import { getWagmiConfig } from '#wagmi.config'
import ChevronFirst from '~icons/lucide/chevron-first'
import ChevronLast from '~icons/lucide/chevron-last'
import ChevronLeft from '~icons/lucide/chevron-left'
import ChevronRight from '~icons/lucide/chevron-right'
import Play from '~icons/lucide/play'

// Track which block numbers are "new" for animation purposes
const recentlyAddedBlocks = new Set<string>()

export const Route = createFileRoute('/_layout/blocks')({
	component: RouteComponent,
	validateSearch: z.object({
		from: z.optional(z.coerce.number()),
		live: z.optional(z.coerce.boolean()),
	}),
	loaderDeps: ({ search: { from, live } }) => ({
		from,
		live: live ?? from == null,
	}),
	loader: ({ deps, context }) =>
		withLoaderTiming('/_layout/blocks', async () =>
			context.queryClient.ensureQueryData(blocksQueryOptions(deps.from)),
		),
})

function RouteComponent() {
	const search = Route.useSearch()
	const from = search.from
	const isAtLatest = from == null
	const live = search.live ?? isAtLatest
	const loaderData = Route.useLoaderData()

	const { data: queryData } = useQuery({
		...blocksQueryOptions(from),
		initialData: loaderData,
	})

	const [latestBlockNumber, setLatestBlockNumber] = React.useState<
		bigint | undefined
	>()
	const currentLatest = latestBlockNumber ?? queryData.latestBlockNumber

	// Initialize with loader data to prevent layout shift
	const [liveBlocks, setLiveBlocks] = React.useState<Block[]>(() =>
		queryData.blocks.slice(0, BLOCKS_PER_PAGE),
	)
	// Track the highest block number we've successfully added to liveBlocks
	const lastAddedBlockRef = React.useRef<bigint | undefined>(
		liveBlocks[0]?.number ?? undefined,
	)
	const isFetchingRef = React.useRef(false)
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
	const [paused, setPaused] = React.useState(false)

	// Fetch missing blocks between lastAdded and target, adding each immediately as it arrives
	const fetchBlockRange = React.useCallback(
		async (targetBlockNumber: bigint) => {
			if (isFetchingRef.current) return
			isFetchingRef.current = true

			try {
				const blocksToFetch = calculateBlocksToFetch(
					lastAddedBlockRef.current,
					targetBlockNumber,
				)

				if (blocksToFetch.length === 0) return

				// Fetch all blocks in parallel, but add each one immediately as it resolves
				await Promise.all(
					blocksToFetch.map(async (blockNumber) => {
						try {
							const block = await getBlock(getWagmiConfig(), { blockNumber })
							if (block) {
								const typedBlock = block as Block
								const blockNum = typedBlock.number?.toString()
								if (blockNum) {
									recentlyAddedBlocks.add(blockNum)
									setTimeout(() => recentlyAddedBlocks.delete(blockNum), 400)
								}

								setLiveBlocks((prev) =>
									mergeBlocks(prev, [typedBlock], BLOCKS_PER_PAGE),
								)

								// Update lastAddedBlockRef if this is higher
								const blockNumber = typedBlock.number
								if (
									blockNumber !== undefined &&
									blockNumber !== null &&
									(lastAddedBlockRef.current === undefined ||
										blockNumber > lastAddedBlockRef.current)
								) {
									lastAddedBlockRef.current = blockNumber
								}
							}
						} catch {
							// Block fetch failed, skip it
						}
					}),
				)
			} finally {
				isFetchingRef.current = false
			}
		},
		[],
	)

	// Watch for new blocks
	useWatchBlockNumber({
		onBlockNumber: (blockNumber: bigint) => {
			if (latestBlockNumber === undefined || blockNumber > latestBlockNumber) {
				setLatestBlockNumber(blockNumber)

				// Only fetch when live and at latest, and not paused
				if (live && isAtLatest && !paused) {
					fetchBlockRange(blockNumber)
				}
			}
		},
		poll: true,
	})

	// Re-initialize when navigating back to latest with live mode
	React.useEffect(() => {
		if (isAtLatest && live && queryData.blocks) {
			setLiveBlocks((prev) => {
				if (prev.length === 0) {
					return queryData.blocks.slice(0, BLOCKS_PER_PAGE)
				}
				return prev
			})
		}
	}, [isAtLatest, live, queryData.blocks])

	// Use live blocks when at latest and live, otherwise use loader data
	const blocks = React.useMemo(() => {
		if (isAtLatest && live && liveBlocks.length > 0) return liveBlocks
		return queryData.blocks
	}, [isAtLatest, live, liveBlocks, queryData.blocks])

	const isLoading = !blocks || blocks.length === 0
	const totalBlocks = currentLatest ? Number(currentLatest) + 1 : 0
	const displayedFrom = blocks[0]?.number ?? undefined
	const displayedEnd = blocks[blocks.length - 1]?.number ?? undefined

	const columns: DataGrid.Column[] = [
		{ label: 'Block', width: '1fr', minWidth: 100 },
		{ label: 'Hash', width: '8fr' },
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
		{ align: 'end', label: 'Txns', width: '1fr' },
	]

	return (
		<div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-300 mx-auto w-full">
			<Sections
				mode="tabs"
				sections={[
					{
						title: 'Blocks',
						totalItems: totalBlocks || undefined,
						autoCollapse: false,
						contextual: (
							<Link
								to="."
								resetScroll={false}
								search={(prev) => ({
									...prev,
									// at latest defaults to live, otherwise defaults to not live
									live: isAtLatest
										? !live
											? undefined
											: false
										: !live
											? true
											: undefined,
								})}
								className={cx(
									'flex items-center gap-[4px] px-[6px] py-[2px] rounded-[4px] text-[11px] font-medium press-down',
									live && !paused
										? 'bg-positive/10 text-positive hover:bg-positive/20'
										: 'bg-base-alt text-tertiary hover:bg-base-alt/80',
								)}
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
										blocks.map((block) => {
											const blockNumber = block.number?.toString() ?? '0'
											const blockHash = block.hash ?? '0x'
											const txCount = block.transactions?.length ?? 0
											const isNew = recentlyAddedBlocks.has(blockNumber)

											return {
												cells: [
													<span
														key="number"
														className="tabular-nums text-accent font-medium"
													>
														#{blockNumber}
													</span>,
													<Midcut key="hash" value={blockHash} prefix="0x" />,
													<span
														key="time"
														className="text-secondary tabular-nums whitespace-nowrap"
													>
														<FormattedTimestamp
															timestamp={block.timestamp}
															format={timeFormat}
														/>
													</span>,
													<span
														key="txns"
														className="text-secondary tabular-nums"
													>
														{txCount}
													</span>,
												],
												link: {
													href: `/block/${blockNumber}`,
													title: `View block #${blockNumber}`,
												},
												className: isNew ? 'bg-positive/5' : undefined,
											}
										})
									}
									totalItems={totalBlocks}
									page={1}
									loading={isLoading}
									itemsLabel="blocks"
									itemsPerPage={BLOCKS_PER_PAGE}
									emptyState="No blocks found."
									pagination={
										<BlocksPagination
											displayedFrom={displayedFrom}
											displayedEnd={displayedEnd}
											latestBlockNumber={currentLatest}
											isAtLatest={isAtLatest}
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

function BlocksPagination({
	displayedFrom,
	displayedEnd,
	latestBlockNumber,
	isAtLatest,
}: {
	displayedFrom: bigint | undefined
	displayedEnd: bigint | undefined
	latestBlockNumber: bigint | undefined
	isAtLatest: boolean
}) {
	const canGoNewer = !isAtLatest
	const canGoOlder = displayedEnd != null && displayedEnd > 0n

	const newerFrom =
		displayedFrom != null ? Number(displayedFrom) + BLOCKS_PER_PAGE : undefined
	const olderFrom = displayedEnd != null ? Number(displayedEnd) - 1 : undefined

	return (
		<div className="flex flex-col items-center sm:flex-row sm:justify-between gap-[12px] border-t border-dashed border-card-border px-[16px] py-[12px] text-[12px] text-tertiary">
			<div className="flex items-center justify-center sm:justify-start gap-[6px]">
				<Link
					to="."
					resetScroll={false}
					search={{ from: undefined, live: undefined }}
					disabled={!canGoNewer}
					className="rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 size-[24px] text-primary"
					title="Latest blocks"
				>
					<ChevronFirst className="size-[14px]" />
				</Link>
				<Link
					to="."
					resetScroll={false}
					search={{ from: newerFrom, live: undefined }}
					disabled={!canGoNewer}
					className="rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 size-[24px] text-primary"
					title="Newer blocks"
				>
					<ChevronLeft className="size-[14px]" />
				</Link>
				<span className="text-primary font-medium tabular-nums px-[4px] whitespace-nowrap">
					{displayedFrom != null ? `#${displayedFrom}-#${displayedEnd}` : '…'}
				</span>
				<Link
					to="."
					resetScroll={false}
					search={{ from: olderFrom, live: false }}
					disabled={!canGoOlder}
					className="rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 size-[24px] text-primary"
					title="Older blocks"
				>
					<ChevronRight className="size-[14px]" />
				</Link>
				<Link
					to="."
					resetScroll={false}
					search={{ from: BLOCKS_PER_PAGE - 1, live: false }}
					disabled={displayedEnd === 0n}
					className="rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 size-[24px] text-primary"
					title="Oldest blocks"
				>
					<ChevronLast className="size-[14px]" />
				</Link>
			</div>
			<span className="tabular-nums">
				{latestBlockNumber != null
					? `${(Number(latestBlockNumber) + 1).toLocaleString()} blocks`
					: '…'}
			</span>
		</div>
	)
}
