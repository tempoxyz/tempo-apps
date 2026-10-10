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

import { DenseTable, style } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { cx } from 'zyzz'
import type { PrestateDiff } from '#lib/queries'
import { srOnly, transitionColors, truncate, vizFill } from '#styles/explorer'
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
		<div {...styles.root()}>
			<div {...styles.meter()}>
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
				<p {...styles.note()}>
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
		<div {...styles.tableWrap()}>
			<DenseTable>
				<DenseTable.Thead>
					<DenseTable.Tr>
						{props.showCall && (
							<DenseTable.Th scope="col" {...styles.callColumn()}>
								Call
							</DenseTable.Th>
						)}
						<DenseTable.Th scope="col">Frame</DenseTable.Th>
						{/* TDS left-aligns header cells; inline wins for number columns. */}
						<DenseTable.Th
							scope="col"
							{...styles.gasColumn({ style: { textAlign: 'right' } })}
						>
							Self
						</DenseTable.Th>
						<DenseTable.Th
							scope="col"
							{...styles.gasColumn({ style: { textAlign: 'right' } })}
						>
							Total
						</DenseTable.Th>
						<DenseTable.Th
							scope="col"
							{...styles.shareColumn({ style: { textAlign: 'right' } })}
						>
							Share
						</DenseTable.Th>
					</DenseTable.Tr>
				</DenseTable.Thead>
				<DenseTable.Tbody>
					{sorted.map((frame) => {
						const share =
							props.rootGas > 0 ? (frame.selfGas / props.rootGas) * 100 : 0
						const selected = frame.node.id === props.selectedId
						return (
							// The row is the click target; the frame button inside makes it
							// reachable by keyboard, and its click bubbles up to here.
							<DenseTable.Tr
								key={frame.node.id}
								onClick={() => props.onSelect(frame.node.id)}
								{...cx(
									styles.row(),
									transitionColors(),
									!selected && styles.rowHover(),
									selected && styles.rowSelected(),
								)}
							>
								{props.showCall && (
									<DenseTable.Td {...styles.callCell()}>
										{frame.call ?? ''}
									</DenseTable.Td>
								)}
								<DenseTable.Td>
									<button
										type="button"
										aria-pressed={selected}
										{...styles.frame()}
									>
										{/* Depth as a badge, not as indentation — a table that
										    indents loses its left edge past about six levels. */}
										<span {...styles.depth()}>
											{frame.depth > 0 ? `+${frame.depth}` : '·'}
										</span>
										{frame.node.hasError && (
											<span aria-hidden {...styles.errorDot()} />
										)}
										<span
											{...cx(styles.label(), truncate())}
											title={frame.label}
										>
											{frame.label}
										</span>
										{frame.node.hasError && (
											<span {...srOnly()}>, reverted</span>
										)}
									</button>
								</DenseTable.Td>
								<DenseTable.Td {...styles.selfGas()}>
									{formatGas(frame.selfGas)}
								</DenseTable.Td>
								<DenseTable.Td {...styles.totalGas()}>
									{formatGas(frame.node.gasUsed)}
								</DenseTable.Td>
								<DenseTable.Td>
									<span {...styles.share()}>
										<span {...styles.shareTrack()}>
											<span
												{...cx(
													styles.shareFill({
														style: { width: `${Math.min(share, 100)}%` },
													}),
													vizFill(),
												)}
											/>
										</span>
										<span {...styles.sharePercent()}>
											{share >= 10 ? share.toFixed(0) : share.toFixed(1)}%
										</span>
									</span>
								</DenseTable.Td>
							</DenseTable.Tr>
						)
					})}
				</DenseTable.Tbody>
			</DenseTable>
		</div>
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

namespace styles {
	export const root = style({ display: 'flex', flexDirection: 'column' })

	export const meter = style({
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		paddingBlock: '16',
		paddingInline: '16',
	})

	export const note = style({
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		color: 'content.secondary',
		margin: 'none',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const tableWrap = style({ padding: '16' })

	export const callColumn = style({ width: '64' })

	export const gasColumn = style({ width: '80px !custom' })

	export const shareColumn = style({ width: '96px !custom' })

	export const row = style({ cursor: 'pointer' })

	export const rowHover = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})

	export const rowSelected = style({ backgroundColor: 'container.strong' })

	export const callCell = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
	})

	export const frame = style({
		alignItems: 'center',
		color: 'inherit !custom',
		cursor: 'pointer',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
		textAlign: 'left',
		width: '100% !custom',
		// The table scrolls sideways, which would clip an outset ring.
		':focus-visible': { outlineOffset: '-2px !custom' },
	})

	export const depth = style({
		color: 'content.secondary',
		flexShrink: 0,
		textAlign: 'right',
		typography: 'mono.inline',
		width: '16',
	})

	export const errorDot = style({
		backgroundColor: 'content.negative',
		borderRadius: 'full',
		flexShrink: 0,
		height: '8',
		width: '8',
	})

	export const label = style({
		color: 'content.primary',
		minWidth: '0 !custom',
		typography: 'mono.inline',
	})

	export const selfGas = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		textAlign: 'right',
	})

	export const totalGas = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
		textAlign: 'right',
	})

	export const share = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'flex-end',
	})

	export const shareTrack = style({
		backgroundColor: 'container.strong',
		borderRadius: 'full',
		height: '4',
		overflow: 'hidden',
		width: '32',
	})

	export const shareFill = style({
		borderRadius: 'full',
		display: 'block',
		height: '100% !custom',
	})

	export const sharePercent = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
		textAlign: 'right',
		width: '40',
	})
}
