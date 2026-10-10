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

import { vars as core } from '@tempoxyz/ds/core'
import { style } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { cx } from 'zyzz'
import type { PrestateDiff } from '#lib/queries'
import { transitionColors, truncate } from '#styles/explorer'
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
		<table {...styles.table()}>
			<thead>
				<tr {...styles.headRow()}>
					{props.showCall && (
						<th {...cx(styles.cell(), styles.edge(), styles.callColumn())}>
							Call
						</th>
					)}
					<th
						{...cx(
							styles.cell(),
							props.showCall && styles.inner(),
							!props.showCall && styles.edge(),
						)}
					>
						Frame
					</th>
					<th
						{...cx(
							styles.cell(),
							styles.inner(),
							styles.numeric(),
							styles.gasColumn(),
						)}
					>
						Self
					</th>
					<th
						{...cx(
							styles.cell(),
							styles.inner(),
							styles.numeric(),
							styles.gasColumn(),
						)}
					>
						Total
					</th>
					<th
						{...cx(
							styles.cell(),
							styles.edge(),
							styles.numeric(),
							styles.shareColumn(),
						)}
					>
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
							{...cx(
								styles.row(),
								transitionColors(),
								!selected && styles.rowHover(),
								selected && styles.rowSelected(),
							)}
						>
							{props.showCall && (
								<td {...cx(styles.cell(), styles.edge(), styles.callCell())}>
									{frame.call ?? ''}
								</td>
							)}
							<td
								{...cx(
									styles.cell(),
									props.showCall && styles.inner(),
									!props.showCall && styles.edge(),
								)}
							>
								<span {...styles.frame()}>
									{/* Depth as a badge, not as indentation — a table that
									    indents loses its left edge past about six levels. */}
									<span {...styles.depth()}>
										{frame.depth > 0 ? `+${frame.depth}` : '·'}
									</span>
									<span
										{...cx(
											styles.label(),
											truncate(),
											frame.node.hasError && styles.labelError(),
										)}
										title={frame.label}
									>
										{frame.label}
									</span>
								</span>
							</td>
							<td {...cx(styles.cell(), styles.inner(), styles.selfGas())}>
								{formatGas(frame.selfGas)}
							</td>
							<td {...cx(styles.cell(), styles.inner(), styles.totalGas())}>
								{formatGas(frame.node.gasUsed)}
							</td>
							<td {...cx(styles.cell(), styles.edge())}>
								<span {...styles.share()}>
									<span {...styles.shareTrack()}>
										<span
											{...styles.shareFill({
												style: { width: `${Math.min(share, 100)}%` },
											})}
										/>
									</span>
									<span {...styles.sharePercent()}>
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

namespace styles {
	export const root = style({ display: 'flex', flexDirection: 'column' })

	export const meter = style({
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		paddingBlock: '12',
		paddingInline: '16',
	})

	export const note = style({
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		color: 'content.tertiary',
		margin: 'none',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const table = style({
		borderCollapse: 'collapse',
		typography: 'body.b2',
		width: '100% !custom',
	})

	export const headRow = style({
		backgroundColor: 'container.subtle',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		color: 'content.tertiary',
	})

	// `fontWeight` undoes the user-agent bold on header cells.
	export const cell = style({
		fontWeight: 'inherit',
		paddingBlock: '8',
		textAlign: 'left',
	})

	export const edge = style({ paddingInline: '16' })

	export const inner = style({ paddingInline: '8' })

	export const numeric = style({ textAlign: 'right' })

	export const callColumn = style({ width: '64px !custom' })

	export const gasColumn = style({ width: '80px !custom' })

	export const shareColumn = style({ width: '92px !custom' })

	export const row = style({
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		cursor: 'pointer',
		':last-child': { borderBottomWidth: 'none' },
	})

	export const rowHover = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})

	export const rowSelected = style({ backgroundColor: 'container.strong' })

	export const callCell = style({
		color: 'content.tertiary',
		fontVariantNumeric: 'tabular-nums',
	})

	export const frame = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const depth = style({
		color: 'content.tertiary',
		flexShrink: 0,
		textAlign: 'right',
		typography: 'mono.inline',
		width: '16px !custom',
	})

	export const label = style({
		color: 'content.primary',
		minWidth: '0 !custom',
		typography: 'mono.inline',
	})

	export const labelError = style({ color: 'content.negative' })

	export const selfGas = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		textAlign: 'right',
	})

	export const totalGas = style({
		color: 'content.tertiary',
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
		height: '3px !custom',
		overflow: 'hidden',
		width: '36px !custom',
	})

	export const shareFill = style({
		backgroundColor: `light-dark(${core.color.accent.violetLight}, ${core.color.accent.violetDark}) !custom`,
		borderRadius: 'full',
		display: 'block',
		height: '100% !custom',
	})

	export const sharePercent = style({
		color: 'content.tertiary',
		fontVariantNumeric: 'tabular-nums',
		textAlign: 'right',
		width: '38px !custom',
	})
}
