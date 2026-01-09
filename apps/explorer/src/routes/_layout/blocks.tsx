import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'
import type { Block } from 'viem'
import { useBlock, useWatchBlockNumber } from 'wagmi'
import * as z from 'zod/mini'
import { Midcut } from '#comps/Midcut'
import { Pagination } from '#comps/Pagination'
import { FormattedTimestamp, useTimeFormat } from '#comps/TimeFormat'
import { cx } from '#cva.config.ts'
import { useIsMounted } from '#lib/hooks'
import { BLOCKS_PER_PAGE, blocksQueryOptions } from '#lib/queries'
import Play from '~icons/lucide/play'

// Track which block numbers are "new" for animation purposes
const recentlyAddedBlocks = new Set<string>()

export const Route = createFileRoute('/_layout/blocks')({
	component: RouteComponent,
	validateSearch: z.object({
		page: z.optional(z.coerce.number()),
		live: z.prefault(z.coerce.boolean(), true),
	}),
	loaderDeps: ({ search: { page, live } }) => ({
		page: page ?? 1,
		live: live ?? (page ?? 1) === 1,
	}),
	loader: async ({ deps, context }) =>
		context.queryClient.ensureQueryData(blocksQueryOptions(deps.page)),
})

function RouteComponent() {
	const search = Route.useSearch()
	const page = search.page ?? 1
	const live = search.live ?? page === 1
	const loaderData = Route.useLoaderData()

	const { data: queryData } = useQuery({
		...blocksQueryOptions(page),
		initialData: loaderData,
	})

	const [latestBlockNumber, setLatestBlockNumber] = React.useState<
		bigint | undefined
	>()
	// Initialize with loader data to prevent layout shift
	const [liveBlocks, setLiveBlocks] = React.useState<Block[]>(() =>
		queryData.blocks.slice(0, BLOCKS_PER_PAGE),
	)
	const isMounted = useIsMounted()
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()

	// Use loader data for initial render, then live updates
	const currentLatest = latestBlockNumber ?? queryData.latestBlockNumber

	// Watch for new blocks (only on page 1 when live)
	useWatchBlockNumber({
		enabled: isMounted && live && page === 1,
		onBlockNumber: (blockNumber) => {
			// Only update if this is actually a new block
			if (latestBlockNumber === undefined || blockNumber > latestBlockNumber) {
				setLatestBlockNumber(blockNumber)
				// Only mark as recently added for animation on page 1
				if (page === 1) {
					recentlyAddedBlocks.add(blockNumber.toString())
					// Clear the animation flag after animation completes
					// TODO: is cleanup necessary?
					setTimeout(() => {
						recentlyAddedBlocks.delete(blockNumber.toString())
					}, 400)
				}
			}
		},
	})

	// Fetch the latest block when block number changes (for live updates on page 1)
	const { data: latestBlock } = useBlock({
		blockNumber: latestBlockNumber,
		query: {
			enabled: live && page === 1 && latestBlockNumber !== undefined,
			staleTime: Number.POSITIVE_INFINITY, // Block data never changes
		},
	})

	// Add new blocks as they arrive
	React.useEffect(() => {
		if (!live || page !== 1 || !latestBlock) return

		setLiveBlocks((prev) => {
			// Don't add if already exists
			if (prev.some((b) => b.number === latestBlock.number)) return prev
			// Prepend new block and keep only BLOCKS_PER_PAGE
			return [latestBlock, ...prev].slice(0, BLOCKS_PER_PAGE)
		})
	}, [latestBlock, live, page])

	// Re-initialize when navigating back to page 1 with live mode
	React.useEffect(() => {
		if (page === 1 && live && queryData.blocks) {
			setLiveBlocks((prev) => {
				// Only reinitialize if we have no blocks or stale data
				if (prev.length === 0) {
					return queryData.blocks.slice(0, BLOCKS_PER_PAGE)
				}
				return prev
			})
		}
	}, [page, live, queryData.blocks])

	// Use live blocks on page 1 when live, otherwise use loader data
	const blocks = React.useMemo(() => {
		if (page === 1 && live && liveBlocks.length > 0) return liveBlocks
		return queryData.blocks
	}, [page, live, liveBlocks, queryData.blocks])

	const isLoading = !blocks || blocks.length === 0

	const totalBlocks = currentLatest ? Number(currentLatest) + 1 : 0
	const totalPages = Math.ceil(totalBlocks / BLOCKS_PER_PAGE)

	return (
		<div className="flex flex-col gap-6 px-6 py-8 max-w-300 mx-auto w-full mt-12">
			<section
				className={cx(
					'flex flex-col w-full overflow-hidden',
					'rounded-[10px] border border-card-border bg-card',
					'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
				)}
			>
				<div className="overflow-x-auto">
					{/* Header */}
					<div className="grid grid-cols-[100px_minmax(150px,1fr)_auto_50px] gap-4 px-4 py-3 border-b border-card-border bg-card-header text-[13px] text-tertiary font-sans font-normal min-w-125">
						<div>Block</div>
						<div>Hash</div>
						<div className="text-right min-w-30">
							<button
								type="button"
								onClick={cycleTimeFormat}
								className="text-tertiary cursor-pointer inline-flex items-center justify-end gap-2 text-right w-full group"
								title={`Showing ${formatLabel} time - click to change`}
							>
								<span>Time</span>
								<span className="bg-base-alt text-primary px-2 py-[3px] rounded-[8px] text-[11px] font-sans capitalize transition-colors group-hover:bg-base-alt/80">
									{formatLabel}
								</span>
							</button>
						</div>
						<div className="text-right">Count</div>
					</div>

					{/* Blocks list */}
					<div className="flex flex-col min-w-125">
						{isLoading ? (
							<div className="px-4 py-8 text-center text-tertiary">
								Loading blocks…
							</div>
						) : blocks && blocks.length > 0 ? (
							blocks.map((block, index) => (
								<BlockRow
									key={block.number?.toString()}
									block={block}
									isNew={recentlyAddedBlocks.has(
										block.number?.toString() ?? '',
									)}
									isLatest={live && page === 1 && index === 0}
									timeFormat={timeFormat}
								/>
							))
						) : (
							<div className="px-4 py-8 text-center text-tertiary">
								No blocks found
							</div>
						)}
					</div>
				</div>

				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-dashed border-card-border px-4 py-3 text-[12px] text-tertiary">
					<Pagination.Simple page={page} totalPages={totalPages} />
					<div className="flex items-center justify-center sm:justify-end gap-3">
						<Link
							to="."
							resetScroll={false}
							search={(prev) => ({ ...prev, live: !live })}
							className={cx(
								'flex items-center gap-1.5 px-2.5 py-1.25 rounded-md text-[12px] font-medium font-sans transition-colors text-primary',
								live
									? 'bg-positive/10 hover:bg-positive/20'
									: 'bg-base-alt hover:bg-base-alt/80',
							)}
							title={live ? 'Pause live updates' : 'Resume live updates'}
						>
							{live ? (
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
						<Pagination.Count totalItems={totalBlocks} itemsLabel="blocks" />
					</div>
				</div>
			</section>
		</div>
	)
}

function BlockRow({
	block,
	isNew,
	isLatest,
	timeFormat,
}: {
	block: Block
	isNew?: boolean
	isLatest?: boolean
	timeFormat: 'relative' | 'local' | 'utc' | 'unix'
}) {
	const txCount = block.transactions?.length ?? 0
	const blockNumber = block.number?.toString() ?? '0'
	const blockHash = block.hash ?? '0x'

	return (
		<div
			className={cx(
				'grid grid-cols-[100px_minmax(150px,1fr)_auto_50px] gap-4 px-4 py-3 text-[13px] hover:bg-base-alt/50 border-b border-dashed border-card-border last:border-b-0 font-mono',
				isNew && 'bg-positive/5',
			)}
		>
			<div className="tabular-nums">
				<Link
					to="/block/$id"
					params={{ id: blockNumber }}
					className="text-accent press-down font-medium font-mono"
				>
					{blockNumber}
				</Link>
			</div>
			<div className="min-w-0">
				<Link
					to="/block/$id"
					params={{ id: blockHash }}
					className="text-secondary hover:text-accent transition-colors font-mono"
					title={blockHash}
				>
					<Midcut value={blockHash} prefix="0x" />
				</Link>
			</div>
			<div className="text-right text-secondary tabular-nums min-w-30 font-mono">
				{isLatest ? (
					'now'
				) : (
					<span className="font-mono">
						<FormattedTimestamp
							timestamp={block.timestamp}
							format={timeFormat}
						/>
					</span>
				)}
			</div>
			<div className="text-right text-secondary tabular-nums font-mono">
				{txCount}
			</div>
		</div>
	)
}
