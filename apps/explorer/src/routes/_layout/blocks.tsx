import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Tooltip } from '@tempoxyz/ds/platform'
import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from '@tempoxyz/ds/platform/icons'
import * as React from 'react'
import { type Block, createPublicClient, webSocket } from 'viem'
import { watchBlocks as subscribeToBlocks } from 'viem/actions'
import { getTempoChain } from '#wagmi.config'
import * as z from 'zod/mini'
import { DataGrid } from '#comps/DataGrid'
import { Midcut } from '#comps/Midcut'
import { Sections } from '#comps/Sections'
import { LiveIndicator } from '#comps/ui/LiveIndicator'
import {
	FormattedTimestamp,
	TimeColumnHeader,
	useTimeFormat,
} from '#comps/TimeFormat'
import { syncBlockNumberAtLeast } from '#lib/block-number'
import { OG_BASE_URL } from '#lib/og'
import { withLoaderTiming } from '#lib/profiling'
import { BLOCKS_PER_PAGE, blocksQueryOptions } from '#lib/queries'
import { link } from '#styles/explorer'
import { styles } from './-blocks.styles'

export const Route = createFileRoute('/_layout/blocks')({
	component: RouteComponent,
	head: () => ({
		meta: [
			{ title: 'Blocks – Tempo Explorer' },
			{ property: 'og:title', content: 'Blocks – Tempo Explorer' },
			{
				property: 'og:description',
				content: 'View the latest blocks on Tempo.',
			},
			{
				property: 'og:image',
				content: `${OG_BASE_URL}/blocks`,
			},
			{ property: 'og:image:type', content: 'image/webp' },
			{ property: 'og:image:width', content: '1200' },
			{ property: 'og:image:height', content: '630' },
			{ name: 'twitter:card', content: 'summary_large_image' },
			{ name: 'twitter:image', content: `${OG_BASE_URL}/blocks` },
		],
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
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
	const [paused, setPaused] = React.useState(false)
	const pausedRef = React.useRef(paused)
	pausedRef.current = paused
	const pendingBlocksRef = React.useRef<Block[]>([])

	const mergeBlocks = React.useCallback((incoming: Block[]) => {
		if (incoming.length === 0) return
		setLiveBlocks((prev) => {
			const existing = new Set(prev.map((b) => b.number))
			const toAdd = incoming.filter(
				(b) => b.number != null && !existing.has(b.number),
			)
			if (toAdd.length === 0) return prev
			return [...toAdd, ...prev]
				.sort((a, b) => Number(b.number) - Number(a.number))
				.slice(0, BLOCKS_PER_PAGE)
		})
	}, [])

	React.useEffect(() => {
		syncBlockNumberAtLeast(queryData.latestBlockNumber)
	}, [queryData.latestBlockNumber])

	// Live feed: stream new blocks over a WebSocket subscription (eth_subscribe
	// newHeads) — viem hydrates each head into a full block (incl. tx hashes) via
	// getBlock. While paused (hover) we buffer incoming blocks and flush them on
	// resume so the view stays frozen.
	React.useEffect(() => {
		if (!live || !isAtLatest) return

		const chain = getTempoChain()
		const wsUrl = (chain.rpcUrls.default as { webSocket?: readonly string[] })
			.webSocket?.[0]
		if (!wsUrl) return

		const client = createPublicClient({ chain, transport: webSocket(wsUrl) })
		return subscribeToBlocks(client, {
			onBlock: (block) => {
				const number = block.number
				if (number != null) {
					setLatestBlockNumber((prev) =>
						prev == null || number > prev ? number : prev,
					)
					syncBlockNumberAtLeast(number)
				}
				if (pausedRef.current) {
					pendingBlocksRef.current.push(block)
					return
				}
				const buffered = pendingBlocksRef.current
				pendingBlocksRef.current = []
				mergeBlocks([...buffered, block])
			},
		})
	}, [live, isAtLatest, mergeBlocks])

	// Flush blocks buffered during a pause as soon as we resume.
	React.useEffect(() => {
		if (paused || pendingBlocksRef.current.length === 0) return
		const buffered = pendingBlocksRef.current
		pendingBlocksRef.current = []
		mergeBlocks(buffered)
	}, [paused, mergeBlocks])

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
		{ align: 'end', label: 'Txns', width: '1fr', minWidth: 56 },
	]

	return (
		<div {...styles.page()}>
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
								aria-label={
									live ? 'Live, pause updates' : 'Paused, resume updates'
								}
								{...styles.liveToggle()}
							>
								{live && !paused ? (
									<LiveIndicator pinging>Live</LiveIndicator>
								) : (
									<LiveIndicator tone="neutral">Paused</LiveIndicator>
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
										blocks.map((block, index) => {
											const blockNumber = block.number?.toString() ?? '0'
											const blockHash = block.hash ?? '0x'
											const txCount = block.transactions?.length ?? 0
											const isActive = isAtLatest && live && index === 0

											return {
												key: `block-${blockNumber}`,
												cells: [
													<span
														key="number"
														{...styles.number({ className: link().className })}
													>
														#{blockNumber}
													</span>,
													<span key="hash" {...styles.hash()}>
														<Midcut value={blockHash} prefix="0x" />
													</span>,
													<span key="time" {...styles.time()}>
														<FormattedTimestamp
															timestamp={block.timestamp}
															format={timeFormat}
														/>
													</span>,
													<span key="txns" {...styles.txns()}>
														{txCount}
													</span>,
												],
												link: {
													href: `/block/${blockNumber}`,
													title: `View block #${blockNumber}`,
												},
												className: isActive
													? styles.liveRow().className
													: undefined,
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
		<div {...styles.pagination()}>
			<div {...styles.paginationControls()}>
				<Tooltip content="Latest blocks">
					<Link
						to="."
						resetScroll={false}
						search={{ from: undefined, live: undefined }}
						disabled={!canGoNewer}
						aria-label="Latest blocks"
						{...styles.pageButton()}
					>
						<ChevronsLeft />
					</Link>
				</Tooltip>
				<Tooltip content="Newer blocks">
					<Link
						to="."
						resetScroll={false}
						search={{ from: newerFrom, live: undefined }}
						disabled={!canGoNewer}
						aria-label="Newer blocks"
						{...styles.pageButton()}
					>
						<ChevronLeft />
					</Link>
				</Tooltip>
				<span {...styles.pageRange()}>
					{displayedFrom != null ? `#${displayedFrom}-#${displayedEnd}` : '…'}
				</span>
				<Tooltip content="Older blocks">
					<Link
						to="."
						resetScroll={false}
						search={{ from: olderFrom, live: undefined }}
						disabled={!canGoOlder}
						aria-label="Older blocks"
						{...styles.pageButton()}
					>
						<ChevronRight />
					</Link>
				</Tooltip>
				<Tooltip content="Oldest blocks">
					<Link
						to="."
						resetScroll={false}
						search={{ from: BLOCKS_PER_PAGE - 1, live: undefined }}
						disabled={displayedEnd === 0n}
						aria-label="Oldest blocks"
						{...styles.pageButton()}
					>
						<ChevronsRight />
					</Link>
				</Tooltip>
			</div>
			<span {...styles.pageCount()}>
				{latestBlockNumber != null
					? `${(Number(latestBlockNumber) + 1).toLocaleString()} blocks`
					: '…'}
			</span>
		</div>
	)
}
