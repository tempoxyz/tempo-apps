import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'
import type { Block } from 'viem'
import { useBlock, useWatchBlockNumber } from 'wagmi'
import { getBlock } from 'wagmi/actions'
import * as z from 'zod/mini'
import { cx } from '#cva.config'
import { DateFormatter, HexFormatter } from '#lib/formatting'
import { config } from '#wagmi.config'
import ChevronFirst from '~icons/lucide/chevron-first'
import ChevronLast from '~icons/lucide/chevron-last'
import ChevronLeft from '~icons/lucide/chevron-left'
import ChevronRight from '~icons/lucide/chevron-right'
import Pause from '~icons/lucide/pause'
import Play from '~icons/lucide/play'

const BLOCKS_PER_PAGE = 12

export const Route = createFileRoute('/_layout/blocks')({
	component: BlocksPage,
	validateSearch: z.object({
		page: z.optional(z.number()),
		live: z.optional(z.boolean()),
	}).parse,
})

function BlocksPage() {
	const { page = 1, live = true } = Route.useSearch()
	const [latestBlockNumber, setLatestBlockNumber] = React.useState<bigint>()
	const queryClient = useQueryClient()

	// Watch for new blocks in realtime
	useWatchBlockNumber({
		pollingInterval: 1000,
		enabled: live,
		onBlockNumber: (blockNumber) => {
			setLatestBlockNumber(blockNumber)
			// Invalidate queries when on first page to show new blocks
			if (page === 1) {
				queryClient.invalidateQueries({ queryKey: ['blocks'] })
			}
		},
	})

	// Get the latest block to determine the total
	const { data: latestBlock } = useBlock({
		query: { enabled: !latestBlockNumber },
	})

	const currentLatest = latestBlockNumber ?? latestBlock?.number

	// Calculate which blocks to show for this page
	const startBlock = currentLatest
		? currentLatest - BigInt((page - 1) * BLOCKS_PER_PAGE)
		: undefined

	// Fetch blocks for the current page
	const { data: blocks, isLoading } = useQuery({
		queryKey: ['blocks', page, currentLatest?.toString()],
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
		enabled: !!startBlock && !!currentLatest,
		staleTime: page === 1 ? 0 : 60_000, // First page refreshes, others are cached
		placeholderData: keepPreviousData, // Keep old data while fetching new
	})

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
					<div className="grid grid-cols-[100px_180px_1fr_50px] gap-4 px-4 py-3 border-b border-card-border bg-card-header text-[12px] text-tertiary uppercase min-w-[500px]">
						<div>Block</div>
						<div>Hash</div>
						<div className="text-right">Timestamp</div>
						<div className="text-right">Txns</div>
					</div>

					{/* Blocks list */}
					<div className="flex flex-col divide-y divide-card-border min-w-[500px]">
						{isLoading ? (
							<div className="px-4 py-8 text-center text-tertiary">
								Loading blocks...
							</div>
						) : blocks && blocks.length > 0 ? (
							blocks.map((block) => (
								<BlockRow key={block.number?.toString()} block={block} />
							))
						) : (
							<div className="px-4 py-8 text-center text-tertiary">
								No blocks found
							</div>
						)}
					</div>
				</div>

				{/* Footer with pagination and live toggle */}
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[12px] border-t border-dashed border-card-border px-[16px] py-[12px] text-[12px] text-tertiary">
					{/* Pagination controls */}
					<div className="flex items-center justify-center sm:justify-start gap-[6px]">
						<Link
							to="."
							resetScroll={false}
							search={{ page: 1 }}
							disabled={page <= 1 || isLoading}
							className={cx(
								'rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[24px] text-primary',
							)}
							aria-label="First page"
						>
							<ChevronFirst className="size-[14px]" />
						</Link>
						<Link
							to="."
							resetScroll={false}
							search={(prev) => ({ page: (prev?.page ?? 1) - 1 })}
							disabled={page <= 1 || isLoading}
							className={cx(
								'rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[24px] text-primary',
							)}
							aria-label="Previous page"
						>
							<ChevronLeft className="size-[14px]" />
						</Link>

						<span className="text-primary font-medium tabular-nums px-[4px]">
							Page {page.toLocaleString()} of {totalPages.toLocaleString()}
						</span>

						<Link
							to="."
							resetScroll={false}
							search={(prev) => ({ page: (prev?.page ?? 1) + 1 })}
							disabled={page >= totalPages || isLoading}
							className={cx(
								'rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[24px] text-primary',
							)}
							aria-label="Next page"
						>
							<ChevronRight className="size-[14px]" />
						</Link>
						<Link
							to="."
							resetScroll={false}
							search={{ page: totalPages }}
							disabled={page >= totalPages || isLoading}
							className={cx(
								'rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[24px] text-primary',
							)}
							aria-label="Last page"
						>
							<ChevronLast className="size-[14px]" />
						</Link>
					</div>

					{/* Live toggle and blocks count */}
					<div className="flex items-center justify-center sm:justify-end gap-[12px]">
						<Link
							to="."
							resetScroll={false}
							search={(prev) => ({ ...prev, live: !live })}
							className={cx(
								'flex items-center gap-[6px] px-[10px] py-[5px] rounded-[6px] text-[12px] font-medium transition-colors',
								live
									? 'bg-accent/10 text-accent hover:bg-accent/20'
									: 'bg-base-alt text-tertiary hover:bg-base-alt/80',
							)}
							title={live ? 'Pause live updates' : 'Resume live updates'}
						>
							{live ? (
								<>
									<Pause className="size-[12px]" />
									<span>Live</span>
								</>
							) : (
								<>
									<Play className="size-[12px]" />
									<span>Paused</span>
								</>
							)}
						</Link>

						<div className="space-x-[8px]">
							<span className="text-primary tabular-nums">
								{totalBlocks.toLocaleString()}
							</span>
							<span className="text-tertiary">blocks</span>
						</div>
					</div>
				</div>
			</section>
		</div>
	)
}

function BlockRow({ block }: { block: Block }) {
	const txCount = block.transactions?.length ?? 0
	const blockNumber = block.number?.toString() ?? '0'
	const blockHash = block.hash ?? '0x'

	return (
		<div className="grid grid-cols-[100px_180px_1fr_50px] gap-4 px-4 py-3 text-[13px] hover:bg-base-alt/50 transition-colors">
			<div>
				<Link
					to="/block/$id"
					params={{ id: blockNumber }}
					className="text-accent press-down font-medium"
				>
					#{blockNumber}
				</Link>
			</div>
			<div className="truncate">
				<Link
					to="/block/$id"
					params={{ id: blockHash }}
					className="text-secondary hover:text-accent transition-colors"
					title={blockHash}
				>
					{HexFormatter.shortenHex(blockHash, 10)}
				</Link>
			</div>
			<div className="text-right text-secondary">
				<RelativeTime timestamp={block.timestamp} />
			</div>
			<div className="text-right text-secondary">{txCount}</div>
		</div>
	)
}

function RelativeTime({ timestamp }: { timestamp: bigint }) {
	const [, forceUpdate] = React.useReducer((x) => x + 1, 0)

	React.useEffect(() => {
		const interval = setInterval(forceUpdate, 1000)
		return () => clearInterval(interval)
	}, [])

	const { text, fullDate } = DateFormatter.formatRelativeTime(timestamp)

	return <span title={fullDate}>{text}</span>
}
