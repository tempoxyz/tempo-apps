import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'
import type { Block } from 'viem'
import { useBlock, useWatchBlockNumber } from 'wagmi'
import { getBlock } from 'wagmi/actions'
import * as z from 'zod/mini'
import { TruncatedHash } from '#components/transaction/TruncatedHash'
import { Pagination } from '#components/ui/Pagination'
import {
	FormattedTimestamp,
	useTimeFormat,
} from '#components/ui/TimeFormat.tsx'
import { cx } from '#cva.config.ts'
import { config, getConfig } from '#wagmi.config.ts'
import Play from '~icons/lucide/play'

const BLOCKS_PER_PAGE = 12

// Track which block numbers are "new" for animation purposes
const recentlyAddedBlocks = new Set<string>()

function blocksQueryOptions(page: number) {
	return queryOptions({
		queryKey: ['blocks-loader', page],
		queryFn: async () => {
			const wagmiConfig = getConfig()

			// Fetch latest block to get the current block number
			const latestBlock = await getBlock(wagmiConfig)
			const latestBlockNumber = latestBlock.number

			// Calculate which blocks to fetch for this page
			const startBlock =
				latestBlockNumber - BigInt((page - 1) * BLOCKS_PER_PAGE)

			const blockNumbers: bigint[] = []
			for (let i = 0n; i < BigInt(BLOCKS_PER_PAGE); i++) {
				const blockNum = startBlock - i
				if (blockNum >= 0n) blockNumbers.push(blockNum)
			}

			// Fetch all blocks in parallel
			const blocks = await Promise.all(
				blockNumbers.map((blockNumber) =>
					getBlock(wagmiConfig, { blockNumber }).catch(() => null),
				),
			)

			return {
				latestBlockNumber,
				blocks: blocks.filter(Boolean) as Block[],
			}
		},
		placeholderData: keepPreviousData,
	})
}

export const Route = createFileRoute('/_layout/blocks')({
	component: RouteComponent,
	validateSearch: z.object({
		page: z.prefault(z.coerce.number(), 1),
		live: z.prefault(z.coerce.boolean(), true),
	}),
	loaderDeps: ({ search: { page, live } }) => ({ page, live }),
	loader: async ({ deps, context }) =>
		context.queryClient.ensureQueryData(blocksQueryOptions(deps.page)),
})

function RouteComponent() {
	const { page = 1, live = true } = Route.useSearch()
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
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()

	// Use loader data for initial render, then live updates
	const currentLatest = latestBlockNumber ?? queryData.latestBlockNumber

	// Watch for new blocks (enabled on all pages when live)
	useWatchBlockNumber({
		pollingInterval: 500, // Fast polling for snappy updates
		enabled: live,
		onBlockNumber: (blockNumber) => {
			// Only update if this is actually a new block
			if (latestBlockNumber === undefined || blockNumber > latestBlockNumber) {
				setLatestBlockNumber(blockNumber)
				// Only mark as recently added for animation on page 1
				if (page === 1) {
					recentlyAddedBlocks.add(blockNumber.toString())
					// Clear the animation flag after animation completes
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

	// Calculate which blocks to show for this page
	const startBlock = currentLatest
		? currentLatest - BigInt((page - 1) * BLOCKS_PER_PAGE)
		: undefined

	// Fetch blocks for non-page-1 or when live is off
	const { data: fetchedBlocks, isLoading: isFetching } = useQuery({
		queryKey: ['blocks', page, startBlock?.toString()],
		queryFn: async () => {
			if (!startBlock || !currentLatest) return []

			const blockNumbers: bigint[] = []
			for (let i = 0n; i < BigInt(BLOCKS_PER_PAGE); i++) {
				const blockNum = startBlock - i
				if (blockNum >= 0n) blockNumbers.push(blockNum)
			}

			const results = await Promise.all(
				blockNumbers.map((blockNumber) =>
					getBlock(config, { blockNumber }).catch(() => null),
				),
			)

			return results.filter(Boolean) as Block[]
		},
		enabled:
			!!startBlock &&
			!!currentLatest &&
			(page !== 1 || !live || liveBlocks.length === 0),
		staleTime: page === 1 && live ? 0 : 60_000,
		placeholderData: keepPreviousData,
	})

	// Use live blocks on page 1 when live, otherwise use fetched/loader data
	const blocks = React.useMemo(() => {
		if (page === 1 && live && liveBlocks.length > 0) {
			return liveBlocks
		}
		return fetchedBlocks ?? (page === 1 ? queryData.blocks : undefined)
	}, [page, live, liveBlocks, fetchedBlocks, queryData.blocks])

	const isLoading = !blocks && isFetching

	const totalBlocks = currentLatest ? Number(currentLatest) + 1 : 0
	const totalPages = Math.ceil(totalBlocks / BLOCKS_PER_PAGE)

	return (
		<div className="flex flex-col gap-6 px-6 py-8 max-w-[1200px] mx-auto w-full">
			<section
				className={cx(
					'flex flex-col font-mono w-full overflow-hidden',
					'rounded-[10px] border border-card-border bg-card',
					'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
				)}
			>
				<div className="overflow-x-auto">
					{/* Header */}
					<div className="grid grid-cols-[100px_minmax(150px,1fr)_auto_50px] gap-4 px-4 py-3 border-b border-card-border bg-card-header text-[12px] text-tertiary uppercase min-w-[500px]">
						<div>Block</div>
						<div>Hash</div>
						<div className="text-right min-w-[120px]">
							<button
								type="button"
								onClick={cycleTimeFormat}
								className="text-secondary hover:text-accent cursor-pointer transition-colors"
								title={`Showing ${formatLabel} time - click to change`}
							>
								Time
							</button>
						</div>
						<div className="text-right">Txns</div>
					</div>

					{/* Blocks list */}
					<div className="flex flex-col min-w-[500px]">
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

				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[12px] border-t border-dashed border-card-border px-[16px] py-[12px] text-[12px] text-tertiary">
					<Pagination.Simple
						page={page}
						totalPages={totalPages}
						isPending={isLoading}
					/>
					<div className="flex items-center justify-center sm:justify-end gap-[12px]">
						<Link
							to="."
							resetScroll={false}
							search={(prev) => ({ ...prev, live: !live })}
							className={cx(
								'flex items-center gap-[6px] px-[10px] py-[5px] rounded-[6px] text-[12px] font-medium transition-colors',
								live
									? 'bg-positive/10 text-positive hover:bg-positive/20'
									: 'bg-base-alt text-tertiary hover:bg-base-alt/80',
							)}
							title={live ? 'Pause live updates' : 'Resume live updates'}
						>
							{live ? (
								<>
									<span className="relative flex size-[8px]">
										<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
										<span className="relative inline-flex rounded-full size-[8px] bg-positive" />
									</span>
									<span>Live</span>
								</>
							) : (
								<>
									<Play className="size-[12px]" />
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
				'grid grid-cols-[100px_minmax(150px,1fr)_auto_50px] gap-4 px-4 py-3 text-[13px] hover:bg-base-alt/50 border-b border-dashed border-card-border last:border-b-0',
				isNew && 'bg-positive/5',
			)}
		>
			<div className="tabular-nums">
				<Link
					to="/block/$id"
					params={{ id: blockNumber }}
					className="text-accent press-down font-medium"
				>
					#{blockNumber}
				</Link>
			</div>
			<div className="min-w-0">
				<Link
					to="/block/$id"
					params={{ id: blockHash }}
					className="text-secondary hover:text-accent transition-colors"
					title={blockHash}
				>
					<TruncatedHash hash={blockHash} minChars={8} />
				</Link>
			</div>
			<div className="text-right text-secondary tabular-nums min-w-[120px]">
				{isLatest ? (
					'now'
				) : (
					<FormattedTimestamp timestamp={block.timestamp} format={timeFormat} />
				)}
			</div>
			<div className="text-right text-secondary tabular-nums">{txCount}</div>
		</div>
	)
}
