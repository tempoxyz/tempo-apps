import { useCallback, useEffect, useMemo, useState } from 'react'
import { cx } from '#lib/css'
import { useCopy } from '#lib/hooks'
import type { PrestateDiff } from '#lib/queries'
import type { TxTraceTree } from './TxTraceTree'
import CopyIcon from '~icons/lucide/copy'
import DatabaseIcon from '~icons/lucide/database'
import ZoomOutIcon from '~icons/lucide/zoom-out'

const BAR_HEIGHT = 32
const MIN_WIDTH_PX = 2

// Warm flame palette: depth 0 = hottest (orange-red), deeper = cooler (yellow → teal)
const FLAME_COLORS = [
	{ bg: 'rgba(234, 88, 12, 0.8)', hover: 'rgba(234, 88, 12, 1)' }, // orange-600
	{ bg: 'rgba(217, 119, 6, 0.75)', hover: 'rgba(217, 119, 6, 0.95)' }, // amber-600
	{ bg: 'rgba(202, 138, 4, 0.7)', hover: 'rgba(202, 138, 4, 0.9)' }, // yellow-600
	{ bg: 'rgba(101, 163, 13, 0.6)', hover: 'rgba(101, 163, 13, 0.8)' }, // lime-600
	{ bg: 'rgba(13, 148, 136, 0.55)', hover: 'rgba(13, 148, 136, 0.75)' }, // teal-600
	{ bg: 'rgba(59, 130, 246, 0.5)', hover: 'rgba(59, 130, 246, 0.7)' }, // blue-500
] as const

function getFlameColor(depth: number) {
	return FLAME_COLORS[Math.min(depth, FLAME_COLORS.length - 1)]
}

export function TxTraceFlamegraph(
	props: TxTraceFlamegraph.Props,
): React.JSX.Element | null {
	const { tree, prestate } = props
	const [zoomedNode, setZoomedNode] = useState<TxTraceTree.Node | null>(null)
	const [hoveredNode, setHoveredNode] = useState<TxTraceTree.Node | null>(null)
	const copy = useCopy()

	const traceRef = tree?.trace
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset zoom/hover when trace root changes
	useEffect(() => {
		setZoomedNode(null)
		setHoveredNode(null)
	}, [traceRef])

	const root = zoomedNode ?? tree

	const rows = useMemo(() => {
		if (!root) return []
		return TxTraceFlamegraph.buildRows(root)
	}, [root])

	const storageByAddress = useMemo(() => {
		if (!prestate) return null
		return TxTraceFlamegraph.buildStorageMap(prestate)
	}, [prestate])

	const maxDepth = rows.length

	if (!tree || !root || maxDepth === 0) return null

	const handleCopy = () => {
		const lines: string[] = []
		const walk = (node: TxTraceTree.Node, depth: number) => {
			const indent = '  '.repeat(depth)
			const name = node.functionName
				? `${node.contractName ?? node.trace.to ?? '??'}.${node.functionName}()`
				: (node.trace.to ?? '[create]')
			const selfGas = TxTraceFlamegraph.getSelfGas(node)
			lines.push(
				`${indent}${name} — ${node.gasUsed.toLocaleString()} gas (self: ${selfGas.toLocaleString()})`,
			)
			for (const child of node.children) walk(child, depth + 1)
		}
		walk(root, 0)
		copy.copy(lines.join('\n'))
	}

	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between pl-[16px] pr-[12px] h-[40px] border-b border-dashed border-distinct">
				<span className="text-[13px]">
					<span className="text-tertiary">Gas Flamegraph</span>
				</span>
				<div className="flex items-center gap-[8px] text-tertiary">
					{zoomedNode && (
						<button
							type="button"
							className="press-down cursor-pointer hover:text-secondary p-[4px]"
							onClick={() => setZoomedNode(null)}
							title="Zoom out to root"
						>
							<ZoomOutIcon className="size-[14px]" />
						</button>
					)}
					{copy.notifying && (
						<span className="text-[11px] select-none">copied</span>
					)}
					<button
						type="button"
						className="press-down cursor-pointer hover:text-secondary p-[4px]"
						onClick={handleCopy}
						title="Copy flamegraph"
					>
						<CopyIcon className="size-[14px]" />
					</button>
				</div>
			</div>

			<div className="px-[16px] py-[12px] overflow-x-auto">
				{/* biome-ignore lint/a11y/noStaticElementInteractions: mouse tracking for details panel */}
				<div
					className="flex flex-col gap-px min-w-0"
					onMouseLeave={() => setHoveredNode(null)}
				>
					{rows.map((row, depth) => (
						<div
							key={depth}
							className="relative w-full"
							style={{ height: BAR_HEIGHT }}
						>
							{row.map((span) => {
								const leftPct =
									root.gasUsed > 0 ? (span.offset / root.gasUsed) * 100 : 0
								const widthPct =
									root.gasUsed > 0 ? (span.width / root.gasUsed) * 100 : 0
								return (
									<TxTraceFlamegraph.Bar
										key={`${span.node.trace.to}-${span.offset}`}
										span={span}
										rootGas={root.gasUsed}
										depth={depth}
										leftPct={leftPct}
										widthPct={widthPct}
										hovered={hoveredNode === span.node}
										storageSlots={
											span.node.trace.to
												? storageByAddress?.get(
														span.node.trace.to.toLowerCase(),
													)
												: undefined
										}
										onHover={setHoveredNode}
										onZoom={setZoomedNode}
									/>
								)
							})}
						</div>
					))}
				</div>
			</div>

			{hoveredNode && (
				<TxTraceFlamegraph.Details
					node={hoveredNode}
					rootGas={root.gasUsed}
					storageSlots={
						hoveredNode.trace.to
							? storageByAddress?.get(hoveredNode.trace.to.toLowerCase())
							: undefined
					}
				/>
			)}
		</div>
	)
}

export declare namespace TxTraceFlamegraph {
	interface Props {
		tree: TxTraceTree.Node | null
		prestate?: PrestateDiff | null | undefined
	}

	interface Span {
		node: TxTraceTree.Node
		offset: number
		width: number
	}

	interface StorageInfo {
		reads: number
		writes: number
	}
}

export namespace TxTraceFlamegraph {
	export function getSelfGas(node: TxTraceTree.Node): number {
		const childGas = node.children.reduce((sum, c) => sum + c.gasUsed, 0)
		return Math.max(0, node.gasUsed - childGas)
	}

	export function buildStorageMap(
		prestate: PrestateDiff,
	): Map<string, StorageInfo> {
		const map = new Map<string, StorageInfo>()
		const allAddrs = new Set([
			...Object.keys(prestate.pre),
			...Object.keys(prestate.post),
		])
		for (const addr of allAddrs) {
			const pre = prestate.pre[addr as `0x${string}`]
			const post = prestate.post[addr as `0x${string}`]
			const preSlots = Object.keys(pre?.storage ?? {})
			const postSlots = Object.keys(post?.storage ?? {})
			const allSlots = new Set([...preSlots, ...postSlots])
			if (allSlots.size === 0) continue

			let writes = 0
			let reads = 0
			for (const slot of allSlots) {
				const preVal = pre?.storage?.[slot as `0x${string}`]
				const postVal = post?.storage?.[slot as `0x${string}`]
				if (preVal !== postVal) writes++
				else reads++
			}

			map.set(addr.toLowerCase(), { reads, writes })
		}
		return map
	}

	export function buildRows(root: TxTraceTree.Node): Span[][] {
		const rows: Span[][] = []

		function walk(node: TxTraceTree.Node, depth: number, offset: number) {
			if (!rows[depth]) rows[depth] = []
			rows[depth].push({ node, offset, width: node.gasUsed })
			let childOffset = offset
			for (const child of node.children) {
				walk(child, depth + 1, childOffset)
				childOffset += child.gasUsed
			}
		}

		walk(root, 0, 0)
		return rows
	}

	export function Bar(props: {
		span: Span
		rootGas: number
		depth: number
		leftPct: number
		widthPct: number
		hovered: boolean
		storageSlots?: StorageInfo | undefined
		onHover: (node: TxTraceTree.Node | null) => void
		onZoom: (node: TxTraceTree.Node) => void
	}): React.JSX.Element {
		const {
			span,
			rootGas,
			depth,
			leftPct,
			widthPct,
			hovered,
			storageSlots,
			onHover,
			onZoom,
		} = props
		const { node } = span

		const isNarrow = widthPct < 1.5
		const hasChildren = node.children.length > 0

		const label = node.functionName
			? `${node.contractName ? `${node.contractName}.` : ''}${node.functionName}()`
			: (node.contractName ?? node.trace.to ?? '[create]')

		const gasPct = rootGas > 0 ? (node.gasUsed / rootGas) * 100 : 0
		const selfGas = getSelfGas(node)
		const selfPct = rootGas > 0 ? (selfGas / rootGas) * 100 : 0
		const hasStorage =
			storageSlots && (storageSlots.reads > 0 || storageSlots.writes > 0)

		const color = node.hasError
			? { bg: 'rgba(239, 68, 68, 0.7)', hover: 'rgba(239, 68, 68, 0.9)' }
			: getFlameColor(depth)

		const handleClick = useCallback(() => {
			if (hasChildren) onZoom(node)
		}, [node, hasChildren, onZoom])

		return (
			<button
				type="button"
				className={cx(
					'absolute top-0 h-full rounded-[3px] text-[11px] font-mono overflow-hidden press-down transition-colors border border-transparent',
					hovered && 'border-white/40 z-10',
					hasChildren ? 'cursor-pointer' : 'cursor-default',
				)}
				style={{
					left: `${leftPct}%`,
					width: `max(${widthPct}%, ${MIN_WIDTH_PX}px)`,
					backgroundColor: hovered ? color.hover : color.bg,
				}}
				onClick={handleClick}
				onMouseEnter={() => onHover(node)}
				aria-label={`${label} — ${node.gasUsed.toLocaleString()} gas (${gasPct.toFixed(1)}%)`}
				title={`${label} — ${node.gasUsed.toLocaleString()} gas (${gasPct.toFixed(1)}%)${hasStorage ? ` · ${storageSlots.writes} SSTORE, ${storageSlots.reads} SLOAD` : ''}`}
			>
				{!isNarrow && (
					<span className="absolute inset-0 flex items-center gap-[4px] px-[6px] overflow-hidden select-none">
						<span
							className="truncate font-medium min-w-0"
							style={{
								color: 'rgba(255, 255, 255, 0.95)',
								textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
							}}
						>
							{label}
						</span>
						<span
							className="shrink-0 text-[10px]"
							style={{ color: 'rgba(255, 255, 255, 0.6)' }}
						>
							{selfPct > 1 ? `${selfPct.toFixed(0)}%` : `${gasPct.toFixed(1)}%`}
						</span>
						{hasStorage && widthPct > 8 && (
							<DatabaseIcon
								className="shrink-0 size-[10px]"
								style={{ color: 'rgba(255, 255, 255, 0.6)' }}
							/>
						)}
					</span>
				)}
			</button>
		)
	}

	export function Details(props: {
		node: TxTraceTree.Node
		rootGas: number
		storageSlots?: StorageInfo | undefined
	}): React.JSX.Element {
		const { node, rootGas, storageSlots } = props
		const gasPct = rootGas > 0 ? (node.gasUsed / rootGas) * 100 : 0
		const selfGas = getSelfGas(node)
		const selfPct = rootGas > 0 ? (selfGas / rootGas) * 100 : 0

		const displayName = node.functionName
			? `${node.functionName}(${node.params ?? ''})`
			: node.trace.type === 'CREATE' || node.trace.type === 'CREATE2'
				? 'new()'
				: 'call()'

		const hasStorage =
			storageSlots && (storageSlots.reads > 0 || storageSlots.writes > 0)

		return (
			<div className="px-[16px] pb-[12px]">
				<div className="flex items-start gap-[12px] bg-distinct border border-card-border rounded-[6px] px-[12px] py-[10px] text-[12px] font-mono">
					<div className="flex flex-col gap-[4px] min-w-0 flex-1">
						<div className="flex items-center gap-[6px]">
							<span
								className={cx(
									'text-[10px] font-medium px-[4px] py-px rounded text-center whitespace-nowrap select-none',
									node.hasError
										? 'bg-negative/20 text-negative'
										: 'bg-accent/20 text-accent',
								)}
							>
								{node.trace.type}
							</span>
							{node.trace.to && (
								<span className="text-accent truncate">
									{node.contractName
										? `${node.contractName}(${node.trace.to})`
										: node.trace.to}
								</span>
							)}
						</div>
						<span className="text-base-content-positive truncate">
							{displayName}
						</span>
						{node.hasError && (
							<span className="text-negative text-[11px]">
								{node.trace.revertReason || node.trace.error || 'reverted'}
							</span>
						)}
					</div>
					<div className="flex flex-col items-end gap-[2px] shrink-0 text-right">
						<span className="text-primary">
							{node.gasUsed.toLocaleString()} gas
						</span>
						<span className="text-tertiary">{gasPct.toFixed(1)}% total</span>
						{node.children.length > 0 && (
							<span className="text-tertiary">
								{selfGas.toLocaleString()} self ({selfPct.toFixed(1)}%)
							</span>
						)}
						{hasStorage && (
							<span className="flex items-center gap-[4px] text-tertiary mt-[2px]">
								<DatabaseIcon className="size-[10px]" />
								{storageSlots.writes > 0 && (
									<span>{storageSlots.writes} SSTORE</span>
								)}
								{storageSlots.reads > 0 && (
									<span>{storageSlots.reads} SLOAD</span>
								)}
							</span>
						)}
					</div>
				</div>
			</div>
		)
	}
}
