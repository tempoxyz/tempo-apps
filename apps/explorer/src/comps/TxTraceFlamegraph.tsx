import { useEffect, useMemo, useState } from 'react'
import { cx } from '#lib/css'
import type { PrestateDiff } from '#lib/queries'
import type { TxTraceTree } from './TxTraceTree'
import DatabaseIcon from '~icons/lucide/database'

const BAR_HEIGHT = 32
const MIN_WIDTH_PX = 6

/**
 * A flamegraph encodes one quantitative variable: share of total gas. So it
 * gets a single-hue ramp from the data-visualisation token, and no semantic
 * colour at all — filling failed frames red put the chart in a three-way fight
 * with the error state above it and the links beside it, and colouring by
 * depth (the previous behaviour) made every shallow trace solid red.
 *
 * Failure is marked structurally instead: a red left edge, the same idiom the
 * trace tree uses for the failure path.
 */
function getFlameColor(gasShare: number) {
	const intensity = 16 + Math.min(Math.max(gasShare, 0), 1) * 30
	return {
		bg: `color-mix(in oklab, var(--color-viz-base) ${intensity}%, transparent)`,
		hover: `color-mix(in oklab, var(--color-viz-base) ${intensity + 16}%, transparent)`,
		border: `color-mix(in oklab, var(--color-viz-base) ${intensity + 22}%, transparent)`,
	}
}

export function TxTraceFlamegraph(
	props: TxTraceFlamegraph.Props,
): React.JSX.Element | null {
	const { tree, prestate } = props
	const [hoveredNode, setHoveredNode] = useState<TxTraceTree.Node | null>(null)

	const traceRef = tree?.trace
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset hover when trace root changes
	useEffect(() => {
		setHoveredNode(null)
	}, [traceRef])

	const root = tree

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

	return (
		<div className="flex flex-col">
			<div className="flex items-center pl-[16px] pr-[12px] h-[40px] border-y border-dashed border-distinct">
				<span className="text-[13px]">
					<span className="text-tertiary">Gas Flamegraph</span>
				</span>
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
							{row.map((span, index) => {
								// Clamp: child gas can exceed the parent's gasUsed in
								// unusual traces, which would push bars past the container.
								const leftPct = Math.min(
									root.gasUsed > 0 ? (span.offset / root.gasUsed) * 100 : 0,
									100,
								)
								const widthPct = Math.min(
									root.gasUsed > 0 ? (span.width / root.gasUsed) * 100 : 0,
									100 - leftPct,
								)
								return (
									<TxTraceFlamegraph.Bar
										key={`${index}-${span.node.trace.to}`}
										span={span}
										rootGas={root.gasUsed}
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
									/>
								)
							})}
						</div>
					))}
				</div>
			</div>

			<TxTraceFlamegraph.Details
				node={hoveredNode}
				rootGas={root.gasUsed}
				storageSlots={
					hoveredNode?.trace.to
						? storageByAddress?.get(hoveredNode.trace.to.toLowerCase())
						: undefined
				}
			/>
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
		leftPct: number
		widthPct: number
		hovered: boolean
		storageSlots?: StorageInfo | undefined
		onHover: (node: TxTraceTree.Node | null) => void
	}): React.JSX.Element {
		const { span, rootGas, leftPct, widthPct, hovered, storageSlots, onHover } =
			props
		const { node } = span

		const isNarrow = widthPct < 1.5

		const label = node.functionName
			? `${node.contractName ? `${node.contractName}.` : ''}${node.functionName}()`
			: (node.contractName ?? node.trace.to ?? '[create]')

		const gasPct = rootGas > 0 ? (node.gasUsed / rootGas) * 100 : 0
		const hasStorage =
			storageSlots && (storageSlots.reads > 0 || storageSlots.writes > 0)

		const color = getFlameColor(rootGas > 0 ? node.gasUsed / rootGas : 0)

		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: hover drives the details panel below
			<div
				className={cx(
					'absolute top-0 h-full rounded-[3px] text-[11px] font-mono overflow-hidden transition-colors border',
					hovered && 'z-10',
					node.hasError && 'border-l-2 border-l-negative!',
				)}
				style={{
					left: `${leftPct}%`,
					width: `max(${widthPct}%, ${MIN_WIDTH_PX}px)`,
					backgroundColor: hovered ? color.hover : color.bg,
					borderColor: color.border,
				}}
				onMouseEnter={() => onHover(node)}
				title={`${label} — ${node.gasUsed.toLocaleString()} gas (${gasPct.toFixed(1)}%)${hasStorage ? ` · ${storageSlots.writes} SSTORE, ${storageSlots.reads} SLOAD` : ''}`}
			>
				{!isNarrow && (
					<span className="absolute inset-0 flex items-center gap-[4px] px-[6px] overflow-hidden select-none">
						<span
							className={cx(
								'truncate font-medium min-w-0',
								node.hasError ? 'text-negative' : 'text-primary',
							)}
						>
							{label}
						</span>
						<span className="shrink-0 text-[10px] text-tertiary">
							{`${gasPct.toFixed(gasPct >= 10 ? 0 : 1)}%`}
						</span>
						{hasStorage && widthPct > 8 && (
							<DatabaseIcon className="shrink-0 size-[10px] text-tertiary" />
						)}
					</span>
				)}
			</div>
		)
	}

	export function Details(props: {
		node: TxTraceTree.Node | null
		rootGas: number
		storageSlots?: StorageInfo | undefined
	}): React.JSX.Element {
		const { node, rootGas, storageSlots } = props

		// Fixed height so the panel doesn't shift the layout as the hovered
		// node's row count (self gas, storage) varies.
		if (!node)
			return (
				<div className="px-[16px] pb-[12px]">
					<div className="flex items-start h-[102px] bg-distinct border border-card-border rounded-[6px] px-[12px] py-[10px] text-[12px] font-mono">
						<span className="text-tertiary select-none">
							Hover a call to see details
						</span>
					</div>
				</div>
			)

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
				<div className="flex items-start gap-[12px] h-[102px] overflow-hidden bg-distinct border border-card-border rounded-[6px] px-[12px] py-[10px] text-[12px] font-mono">
					<div className="flex flex-col gap-[4px] min-w-0 flex-1">
						<div className="flex items-center gap-[6px]">
							<span
								className={cx(
									'text-[10px] font-medium px-[4px] py-px rounded text-center whitespace-nowrap select-none',
									node.hasError
										? 'bg-negative/15 text-negative'
										: 'bg-distinct text-tertiary',
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
						<span className="text-code-identifier truncate">{displayName}</span>
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
