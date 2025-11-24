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
import { Pagination } from '#components/Pagination'
import { cx } from '#cva.config'
import { DateFormatter, HexFormatter } from '#lib/formatting'
import { config } from '#wagmi.config'

const BLOCKS_PER_PAGE = 12

export const Route = createFileRoute('/_layout/blocks')({
	component: BlocksPage,
	validateSearch: z.object({
		page: z.optional(z.number()),
	}).parse,
})

function BlocksPage() {
	const { page = 1 } = Route.useSearch()
	const [latestBlockNumber, setLatestBlockNumber] = React.useState<bigint>()
	const queryClient = useQueryClient()

	// Watch for new blocks in realtime
	useWatchBlockNumber({
		pollingInterval: 1000,
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
				{/* Header */}
				<div className="grid grid-cols-[100px_1fr_180px_100px] gap-4 px-4 py-3 border-b border-card-border bg-card-header text-[12px] text-tertiary uppercase">
					<div>Block</div>
					<div>Hash</div>
					<div>Timestamp</div>
					<div className="text-right">Txns</div>
				</div>

				{/* Blocks list */}
				<div className="flex flex-col divide-y divide-card-border">
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

				{/* Pagination */}
				{totalPages > 1 && (
					<Pagination
						page={page}
						totalPages={totalPages}
						totalItems={totalBlocks}
						itemsLabel="blocks"
						isPending={isLoading}
						compact
					/>
				)}
			</section>
		</div>
	)
}

function BlockRow({ block }: { block: Block }) {
	const txCount = block.transactions?.length ?? 0
	const blockNumber = block.number?.toString() ?? '0'
	const blockHash = block.hash ?? '0x'

	const { text: relativeTime, fullDate } = DateFormatter.formatRelativeTime(
		block.timestamp,
	)

	return (
		<div className="grid grid-cols-[100px_1fr_180px_100px] gap-4 px-4 py-3 text-[13px] hover:bg-base-alt/50 transition-colors">
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
			<div className="text-secondary">
				<span title={fullDate}>{relativeTime}</span>
			</div>
			<div className="text-right text-secondary">{txCount}</div>
		</div>
	)
}
