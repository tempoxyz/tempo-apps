/**
 * The Gas tab.
 *
 * A flamegraph shows where the gas went, but only when there is a shape to
 * see: nearly every TIP-20 call on Tempo is one frame, which would draw as a
 * single full-width bar. The table does the real work. Sorted by self gas, it
 * points at the frame to fix and stays readable at any depth.
 */

import { style, Table, Tag } from '@tempoxyz/ds'
import * as React from 'react'
import { cx } from 'zyzz'
import type { PrestateDiff } from '#lib/queries'
import { truncate } from '#styles/explorer'
import { PanelEmpty } from './SimulateShared'
import { MIN_FLAMEGRAPH_FRAMES, TxTraceFlamegraph } from './TxTraceFlamegraph'
import { TxTraceTree } from './TxTraceTree'

export function SimulateGasPanel(
	props: SimulateGasPanel.Props,
): React.JSX.Element {
	const { trees } = props
	const tableTitleId = React.useId()
	const present = trees.filter((tree): tree is TxTraceTree.Node =>
		Boolean(tree),
	)
	// More than one tree means a batch: the frame table says which call each
	// frame came from, and there is no single root to lay a graph out from.
	const multiCall = trees.length > 1

	const frames = React.useMemo(
		() =>
			trees.flatMap((tree, index) =>
				tree ? flatten(tree, multiCall ? String(index + 1) : undefined) : [],
			),
		[trees, multiCall],
	)
	// A frame's share is of everything shown, not of the call it sits in.
	const totalGas = present.reduce((sum, tree) => sum + tree.gasUsed, 0)
	// The calls of a batch are siblings with no common root, so the graph
	// appears only when exactly one tree is in view.
	const single = present.length === 1 ? present[0] : undefined

	if (present.length === 0)
		return (
			<PanelEmpty
				title="No gas breakdown"
				description="The node returned no trace for this call."
			/>
		)

	return (
		<div {...styles.root()}>
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
						? `${present.length} calls. Show one call to see its flamegraph.`
						: frames.length === 1
							? 'One frame, so there is no flamegraph to draw.'
							: `${frames.length} frames, too shallow for a flamegraph.`}
				</p>
			)}

			<section aria-labelledby={tableTitleId}>
				<h3 id={tableTitleId} {...styles.sectionTitle()}>
					Frames by self gas
				</h3>
				<FrameTable
					frames={frames}
					labelledBy={tableTitleId}
					rootGas={totalGas}
					showCall={multiCall}
					selectedId={props.selectedFrameId}
					onSelect={props.onSelectFrame}
				/>
			</section>
		</div>
	)
}

export declare namespace SimulateGasPanel {
	interface Props {
		/** One tree per call in view. A single call is a list of one. */
		trees: ReadonlyArray<TxTraceTree.Node | null>
		prestate: PrestateDiff | null
		selectedFrameId: string | undefined
		onSelectFrame: (id: string) => void
	}
}

/**
 * Frames by self gas: the gas a frame burned itself, excluding its children.
 * Total gas is the wrong sort key, because the root always wins.
 *
 * Each row selects its frame in the trace, by click or by Enter or Space.
 */
function FrameTable(props: {
	frames: readonly Frame[]
	/** Id of the visible heading that names the table. */
	labelledBy?: string | undefined
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
		<Table.Root
			aria-labelledby={props.labelledBy}
			interactive
			size="small"
			{...styles.table()}
		>
			<Table.Head>
				<Table.Row>
					{props.showCall && (
						<Table.HeaderCell {...styles.callColumn()}>Call</Table.HeaderCell>
					)}
					<Table.HeaderCell>Frame</Table.HeaderCell>
					<Table.HeaderCell justify="end" {...styles.gasColumn()}>
						Self gas
					</Table.HeaderCell>
					<Table.HeaderCell justify="end" {...styles.gasColumn()}>
						Total gas
					</Table.HeaderCell>
					<Table.HeaderCell justify="end" {...styles.shareColumn()}>
						Share
					</Table.HeaderCell>
				</Table.Row>
			</Table.Head>
			<Table.Body>
				{sorted.map((frame) => {
					const share =
						props.rootGas > 0 ? (frame.selfGas / props.rootGas) * 100 : 0
					return (
						<Table.Row
							key={frame.node.id}
							aria-current={frame.node.id === props.selectedId || undefined}
							data-selected={frame.node.id === props.selectedId || undefined}
							onClick={() => props.onSelect(frame.node.id)}
							onKeyDown={(event) => {
								if (event.key !== 'Enter' && event.key !== ' ') return
								event.preventDefault()
								props.onSelect(frame.node.id)
							}}
							tabIndex={0}
							{...styles.row()}
						>
							{props.showCall && (
								<Table.Cell numeric>{frame.call ?? ''}</Table.Cell>
							)}
							<Table.Cell>
								<span {...styles.frame()}>
									{/* Depth as a number, not as indentation: a table that
									    indents loses its left edge past a few levels. */}
									<span {...styles.depth()}>
										{frame.depth > 0 ? `+${frame.depth}` : '·'}
									</span>
									<span {...cx(styles.label(), truncate())} title={frame.label}>
										{frame.label}
									</span>
									{frame.node.hasError && (
										<Tag
											intent="negative"
											size="small"
											variant="plain"
											{...styles.shrink()}
										>
											<Tag.Dot />
											Failed
										</Tag>
									)}
								</span>
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								{frame.selfGas.toLocaleString()}
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								{frame.node.gasUsed.toLocaleString()}
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								{share.toFixed(1)}%
							</Table.Cell>
						</Table.Row>
					)
				})}
			</Table.Body>
		</Table.Root>
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

	export const note = style({
		color: 'gray.900',
		margin: '0',
		paddingInline: '16',
		paddingTop: '16',
		typography: 'copy.14',
	})

	export const sectionTitle = style({
		color: 'foreground',
		margin: '0',
		paddingBottom: '8',
		paddingInline: '16',
		paddingTop: '24',
		typography: 'heading.16',
	})

	// Fixed columns, so frame labels truncate instead of widening the table.
	export const table = style({ tableLayout: 'fixed' })

	export const callColumn = style({ width: '64' })

	export const gasColumn = style({ width: '112' })

	export const shareColumn = style({ width: '80' })

	// Table has no selected-row state, so the selected frame gets its own fill.
	export const row = style({
		selectors: {
			'&[data-selected]': { backgroundColor: 'grayAlpha.200' },
		},
	})

	export const frame = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const depth = style({
		color: 'gray.900',
		flexShrink: 0,
		fontVariantNumeric: 'tabular-nums',
		textAlign: 'end',
		width: '16',
	})

	export const label = style({
		color: 'foreground',
		minWidth: '0 !custom',
		typography: 'label.13.mono',
	})

	export const shrink = style({ flexShrink: 0 })
}
