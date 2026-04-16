import { useCallback, useEffect, useMemo, useState } from 'react'
import { cx } from '#lib/css'
import { useCopy } from '#lib/hooks'
import type { TxTraceTree } from './TxTraceTree'
import CopyIcon from '~icons/lucide/copy'
import ZoomOutIcon from '~icons/lucide/zoom-out'

export function TxTraceFlamegraph(
	props: TxTraceFlamegraph.Props,
): React.JSX.Element | null {
	const { tree } = props
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

	const maxDepth = rows.length

	if (!tree || !root || maxDepth === 0) return null

	const handleCopy = () => {
		const lines: string[] = []
		const walk = (node: TxTraceTree.Node, depth: number) => {
			const indent = '  '.repeat(depth)
			const name = node.functionName
				? `${node.contractName ?? node.trace.to ?? '??'}.${node.functionName}()`
				: (node.trace.to ?? '[create]')
			lines.push(`${indent}${name} — ${node.gasUsed.toLocaleString()} gas`)
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
					className="flex flex-col gap-[1px] min-w-0"
					onMouseLeave={() => setHoveredNode(null)}
				>
					{rows.map((row, depth) => (
						<div key={depth} className="relative h-[24px] w-full">
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
										leftPct={leftPct}
										widthPct={widthPct}
										hovered={hoveredNode === span.node}
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
				<TxTraceFlamegraph.Details node={hoveredNode} rootGas={root.gasUsed} />
			)}
		</div>
	)
}

export declare namespace TxTraceFlamegraph {
	interface Props {
		tree: TxTraceTree.Node | null
	}

	interface Span {
		node: TxTraceTree.Node
		offset: number
		width: number
	}
}

export namespace TxTraceFlamegraph {
	export function buildRows(root: TxTraceTree.Node): Span[][] {
		const rows: Span[][] = []

		function walk(node: TxTraceTree.Node, depth: number, offset: number) {
			if (!rows[depth]) rows[depth] = []
			rows[depth].push({
				node,
				offset,
				width: node.gasUsed,
			})
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
		onHover: (node: TxTraceTree.Node | null) => void
		onZoom: (node: TxTraceTree.Node) => void
	}): React.JSX.Element {
		const { span, rootGas, leftPct, widthPct, hovered, onHover, onZoom } = props
		const { node } = span

		const isNarrow = widthPct < 0.5
		const hasChildren = node.children.length > 0

		const label = node.functionName
			? `${node.contractName ? `${node.contractName}.` : ''}${node.functionName}()`
			: (node.contractName ?? node.trace.to ?? '[create]')

		const gasPct = rootGas > 0 ? (node.gasUsed / rootGas) * 100 : 0

		const colorClass = node.hasError
			? 'bg-negative/60 hover:bg-negative/80'
			: gasPct > 50
				? 'bg-[#b45309]/70 hover:bg-[#b45309]/90'
				: gasPct > 20
					? 'bg-[#a16207]/50 hover:bg-[#a16207]/70'
					: gasPct > 5
						? 'bg-accent/40 hover:bg-accent/60'
						: 'bg-accent/25 hover:bg-accent/40'

		const handleClick = useCallback(() => {
			if (hasChildren) onZoom(node)
		}, [node, hasChildren, onZoom])

		return (
			<button
				type="button"
				className={cx(
					'absolute top-0 h-full rounded-[2px] text-[10px] font-mono overflow-hidden press-down transition-colors',
					colorClass,
					hovered && 'ring-1 ring-accent',
					hasChildren ? 'cursor-pointer' : 'cursor-default',
				)}
				style={{
					left: `${leftPct}%`,
					width: `max(${widthPct}%, 2px)`,
				}}
				onClick={handleClick}
				onMouseEnter={() => onHover(node)}
				aria-label={`${label} — ${node.gasUsed.toLocaleString()} gas (${gasPct.toFixed(1)}%)`}
				title={`${label} — ${node.gasUsed.toLocaleString()} gas (${gasPct.toFixed(1)}%)`}
			>
				{!isNarrow && (
					<span className="absolute inset-0 flex items-center px-[4px] truncate text-primary select-none">
						{label}
					</span>
				)}
			</button>
		)
	}

	export function Details(props: {
		node: TxTraceTree.Node
		rootGas: number
	}): React.JSX.Element {
		const { node, rootGas } = props
		const gasPct = rootGas > 0 ? (node.gasUsed / rootGas) * 100 : 0

		const displayName = node.functionName
			? `${node.functionName}(${node.params ?? ''})`
			: node.trace.type === 'CREATE' || node.trace.type === 'CREATE2'
				? 'new()'
				: 'call()'

		return (
			<div className="px-[16px] pb-[12px]">
				<div className="flex items-start gap-[12px] bg-distinct border border-card-border rounded-[6px] px-[12px] py-[8px] text-[12px] font-mono">
					<div className="flex flex-col gap-[2px] min-w-0 flex-1">
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
						<span className="text-tertiary">{gasPct.toFixed(1)}%</span>
					</div>
				</div>
			</div>
		)
	}
}
