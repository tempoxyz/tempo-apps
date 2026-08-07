/**
 * The Gas tab.
 *
 * The flamegraph used to be welded under the trace tree and rendered always. On
 * a one-frame call — which is nearly every TIP-20 call on Tempo — that is a
 * single 100%-wide bar plus a permanently empty hover box, which is why a
 * successful simulation looked broken. Here it is one view among three, and it
 * only appears when there is actually a shape to see.
 *
 * The list is doing the real work. A flamegraph shows you *where* the gas is;
 * a table sorted by self gas tells you *what to fix*, and it stays readable at
 * any depth.
 */

import * as React from 'react'
import { cx } from '#lib/css'
import type { PrestateDiff } from '#lib/queries'
import { formatGas, GasMeter, PanelEmpty } from './SimulateShared'
import { MIN_FLAMEGRAPH_FRAMES, TxTraceFlamegraph } from './TxTraceFlamegraph'
import { TxTraceTree } from './TxTraceTree'

export function SimulateGasPanel(
	props: SimulateGasPanel.Props,
): React.JSX.Element {
	const { trees, gasLimit } = props
	const present = trees.filter((tree): tree is TxTraceTree.Node =>
		Boolean(tree),
	)
	// More than one tree means a batch: the frame table needs to say which call
	// each frame came from, and there is no single root to lay a graph out from.
	const multiCall = trees.length > 1

	const frames = React.useMemo(
		() =>
			trees.flatMap((tree, index) =>
				tree ? flatten(tree, multiCall ? String(index + 1) : undefined) : [],
			),
		[trees, multiCall],
	)
	// Total, so a frame's share is its share of everything shown — not of
	// whichever call it happens to sit in.
	const totalGas = present.reduce((sum, tree) => sum + tree.gasUsed, 0)
	// A flamegraph lays bars out as fractions of one root. A batch has no single
	// root — the calls are siblings, deliberately not stitched together — so the
	// graph appears only when exactly one tree is in view.
	const single = present.length === 1 ? present[0] : undefined

	if (present.length === 0)
		return <PanelEmpty>No trace, so no gas breakdown.</PanelEmpty>

	return (
		<div className="flex flex-col">
			<div className="border-b border-dashed border-card-border px-[16px] py-[12px]">
				<GasMeter used={props.gasUsed} limit={gasLimit} />
			</div>

			{single && single.subtreeSize >= MIN_FLAMEGRAPH_FRAMES ? (
				<TxTraceFlamegraph
					tree={single}
					prestate={props.prestate}
					selectedId={props.selectedFrameId}
					onSelect={props.onSelectFrame}
				/>
			) : (
				<p className="border-b border-dashed border-card-border px-[16px] py-[10px] text-[11px] text-content-dimmed">
					{present.length > 1
						? `${present.length} calls — pick one call above to see its flamegraph.`
						: frames.length === 1
							? 'One frame — a flamegraph would be a single full-width bar.'
							: `${frames.length} frames — too shallow for a flamegraph to say anything.`}
				</p>
			)}

			<FrameTable
				frames={frames}
				rootGas={totalGas}
				showCall={multiCall}
				selectedId={props.selectedFrameId}
				onSelect={props.onSelectFrame}
			/>
		</div>
	)
}

export declare namespace SimulateGasPanel {
	interface Props {
		/** One tree per call in view. A single call is a list of one. */
		trees: ReadonlyArray<TxTraceTree.Node | null>
		prestate: PrestateDiff | null
		gasUsed: bigint
		gasLimit: bigint
		selectedFrameId: string | undefined
		onSelectFrame: (id: string) => void
	}
}

/**
 * Frames by self gas — the gas a frame burned itself, excluding its children.
 *
 * Total gas is the wrong sort key for optimisation: the root always wins and
 * tells you nothing. Self gas points at the line to change.
 */
function FrameTable(props: {
	frames: readonly Frame[]
	rootGas: number
	showCall: boolean
	selectedId: string | undefined
	onSelect: (id: string) => void
}): React.JSX.Element {
	const sorted = React.useMemo(
		() => [...props.frames].sort((a, b) => b.selfGas - a.selfGas),
		[props.frames],
	)

	return (
		<table className="w-full text-[12px]">
			<thead>
				<tr className="border-b border-card-border bg-base-alt text-[11px] text-tertiary">
					{props.showCall && (
						<th className="w-[64px] px-[16px] py-[6px] text-left font-normal">
							Call
						</th>
					)}
					<th
						className={cx(
							'py-[6px] text-left font-normal',
							props.showCall ? 'px-[8px]' : 'px-[16px]',
						)}
					>
						Frame
					</th>
					<th className="w-[80px] px-[8px] py-[6px] text-right font-normal">
						Self
					</th>
					<th className="w-[80px] px-[8px] py-[6px] text-right font-normal">
						Total
					</th>
					<th className="w-[92px] px-[16px] py-[6px] text-right font-normal">
						Share
					</th>
				</tr>
			</thead>
			<tbody>
				{sorted.map((frame) => {
					const share =
						props.rootGas > 0 ? (frame.selfGas / props.rootGas) * 100 : 0
					const selected = frame.node.id === props.selectedId
					return (
						<tr
							key={frame.node.id}
							onClick={() => props.onSelect(frame.node.id)}
							className={cx(
								'cursor-pointer border-b border-card-border last:border-0 transition-colors',
								selected ? 'bg-accent/8' : 'hover:bg-base-plane-interactive',
							)}
						>
							{props.showCall && (
								<td className="px-[16px] py-[6px] font-mono text-[11px] text-tertiary">
									{frame.call ?? ''}
								</td>
							)}
							<td
								className={cx(
									'py-[6px]',
									props.showCall ? 'px-[8px]' : 'px-[16px]',
								)}
							>
								<span className="flex min-w-0 items-center gap-[7px]">
									{/* Depth as a badge, not as indentation — a table that
									    indents loses its left edge past about six levels. */}
									<span className="w-[16px] shrink-0 text-right font-mono text-[10px] text-content-dimmed">
										{frame.depth > 0 ? `+${frame.depth}` : '·'}
									</span>
									<span
										className={cx(
											'min-w-0 truncate font-mono',
											frame.node.hasError ? 'text-negative' : 'text-primary',
										)}
										title={frame.label}
									>
										{frame.label}
									</span>
								</span>
							</td>
							<td className="px-[8px] py-[6px] text-right font-mono tabular-nums text-primary">
								{formatGas(frame.selfGas)}
							</td>
							<td className="px-[8px] py-[6px] text-right font-mono tabular-nums text-tertiary">
								{formatGas(frame.node.gasUsed)}
							</td>
							<td className="px-[16px] py-[6px]">
								<span className="flex items-center justify-end gap-[7px]">
									<span className="h-[3px] w-[36px] overflow-hidden rounded-full bg-distinct">
										<span
											className="block h-full rounded-full bg-viz-base"
											style={{ width: `${Math.min(share, 100)}%` }}
										/>
									</span>
									<span className="w-[38px] text-right font-mono tabular-nums text-tertiary">
										{share >= 10 ? share.toFixed(0) : share.toFixed(1)}%
									</span>
								</span>
							</td>
						</tr>
					)
				})}
			</tbody>
		</table>
	)
}

type Frame = {
	node: TxTraceTree.Node
	depth: number
	selfGas: number
	label: string
	call?: string | undefined
}

function flatten(root: TxTraceTree.Node, call?: string | undefined): Frame[] {
	const frames: Frame[] = []
	const walk = (node: TxTraceTree.Node, depth: number) => {
		frames.push({
			node,
			depth,
			selfGas: TxTraceFlamegraph.getSelfGas(node),
			label: TxTraceTree.label(node),
			call,
		})
		for (const child of node.children) walk(child, depth + 1)
	}
	walk(root, 0)
	return frames
}
