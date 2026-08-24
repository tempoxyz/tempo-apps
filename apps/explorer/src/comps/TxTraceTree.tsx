import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { decodeAbiParameters, erc20Abi, slice } from 'viem'
import type { Abi, Hex } from 'viem'
import { cx } from '#lib/css'
import { PanelToolbar, SegmentedControl } from './PanelToolbar'
import {
	formatAbiValue,
	getAbiItem,
	getContractInfo,
	precompileRegistry,
} from '#lib/domain/contracts'
import { decodePrecompile } from '#lib/domain/precompiles'
import {
	decodeTraceError,
	findDeepestFailurePath,
	formatDecodedTraceError,
	formatDecodedTraceErrorShort,
	getRevertData,
	type DecodedTraceError,
} from '#lib/domain/trace-errors'
import { HexFormatter } from '#lib/formatting'
import { useCopy, usePermalinkHighlight } from '#lib/hooks'
import type { CallTrace } from '#lib/queries'
import { batchAbiQueryOptions, populateCacheFromBatch } from '#lib/queries'
import ArrowRightIcon from '~icons/lucide/arrow-right'
import CheckIcon from '~icons/lucide/check'
import FoldIcon from '~icons/lucide/fold-vertical'
import UnfoldIcon from '~icons/lucide/unfold-vertical'
import CircleAlertIcon from '~icons/lucide/circle-alert'
import CopyIcon from '~icons/lucide/copy'
import WrapIcon from '~icons/lucide/corner-down-left'
import ReturnIcon from '~icons/lucide/corner-down-right'

export function TxTraceTree(props: TxTraceTree.Props) {
	const { trace, tree: treeProp, label = 'Execution Trace', toolbar } = props
	const [raw, setRaw] = useState(false)
	// A trace line is a sentence with a fixed left edge. Wrapping it turns a
	// deep frame into a four-line paragraph and destroys the depth read, so the
	// default is to scroll sideways — wrap stays available for copy-reading.
	const [wrap, setWrap] = useState(!toolbar)
	const [query, setQuery] = useState('')
	const [collapseKey, setCollapseKey] = useState<{
		all: boolean
		nonce: number
	} | null>(null)
	const copy = useCopy()

	const builtTree = useTraceTree(treeProp ? null : trace)
	const tree = treeProp ?? builtTree

	const trimmed = query.trim().toLowerCase()
	const matches = useMemo(
		() => (tree && trimmed ? matchingIds(tree, trimmed) : null),
		[tree, trimmed],
	)
	const ancestorsOfSelection = useMemo(
		() =>
			tree && props.selectedId ? ancestorIds(tree, props.selectedId) : null,
		[tree, props.selectedId],
	)

	if (!tree) return null

	const handleCopy = () => {
		copy.copy(TxTraceTree.toAscii(tree, { raw }))
	}

	const isTree = tree.subtreeSize > 1
	// A one-frame trace has nothing to filter, expand, or collapse, and inside a
	// batch it already has a heading above it — so the panel variant draws its
	// toolbar only when there is a tree to work on.
	const showToolbar = toolbar && isTree
	const failedNode = showToolbar ? findDeepestFailedNode(tree) : null

	return (
		<div className="flex min-w-0 flex-col">
			{showToolbar ? (
				<PanelToolbar>
					{
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Filter frames…"
							spellCheck={false}
							className="h-[24px] w-full max-w-[240px] min-w-0 mr-auto rounded-[6px] border border-card-border bg-base-plane px-[8px] font-mono text-[11px] text-primary outline-none placeholder:text-field-content-secondary focus:border-accent"
						/>
					}
					{failedNode && (
						<button
							type="button"
							onClick={() => props.onSelect?.(failedNode.id)}
							className="flex h-[24px] shrink-0 items-center gap-[5px] rounded-[6px] border border-negative/40 px-[8px] text-[11px] text-negative cursor-pointer press-down hover:bg-negative/8"
							title="Jump to the frame that reverted"
						>
							<CircleAlertIcon className="size-[11px]" />
							Go to revert
						</button>
					)}
					{
						<>
							<PanelToolbar.IconButton
								onClick={() =>
									setCollapseKey({
										all: false,
										nonce: (collapseKey?.nonce ?? 0) + 1,
									})
								}
								title="Expand all frames"
							>
								<UnfoldIcon className="size-[12px]" />
							</PanelToolbar.IconButton>
							<PanelToolbar.IconButton
								onClick={() =>
									setCollapseKey({
										all: true,
										nonce: (collapseKey?.nonce ?? 0) + 1,
									})
								}
								title="Collapse all frames"
							>
								<FoldIcon className="size-[12px]" />
							</PanelToolbar.IconButton>
						</>
					}
					<PanelToolbar.IconButton
						onClick={() => setWrap(!wrap)}
						active={wrap}
						title={wrap ? 'Disable line wrap' : 'Enable line wrap'}
					>
						<WrapIcon className="size-[12px]" />
					</PanelToolbar.IconButton>
					<PanelToolbar.IconButton onClick={handleCopy} title="Copy trace">
						{copy.notifying ? (
							<CheckIcon className="size-[12px]" />
						) : (
							<CopyIcon className="size-[12px]" />
						)}
					</PanelToolbar.IconButton>
					<SegmentedControl
						size="sm"
						value={raw ? 'raw' : 'decoded'}
						options={[
							{ value: 'decoded', label: 'Decoded' },
							{ value: 'raw', label: 'Raw' },
						]}
						onChange={(value) => setRaw(value === 'raw')}
					/>
				</PanelToolbar>
			) : label ? (
				<div className="flex items-center justify-between pl-[16px] pr-[12px] h-[40px] border-b border-dashed border-distinct">
					<span className="text-[13px]">
						<span className="text-tertiary">{label} </span>
						<RawToggle raw={raw} onToggle={() => setRaw(!raw)} />
					</span>
					<div className="flex items-center gap-[8px] text-tertiary">
						{copy.notifying && (
							<span className="text-[11px] select-none">copied</span>
						)}
						<button
							type="button"
							className="press-down cursor-pointer hover:text-secondary p-[4px]"
							onClick={handleCopy}
							title="Copy trace"
						>
							<CopyIcon className="size-[14px]" />
						</button>
						<button
							type="button"
							onClick={() => setWrap(!wrap)}
							className="press-down cursor-pointer hover:text-secondary p-[4px]"
							title={wrap ? 'Disable line wrap' : 'Enable line wrap'}
						>
							<WrapIcon className={cx('size-[14px]', wrap && 'text-primary')} />
						</button>
					</div>
				</div>
			) : null}
			<div
				tabIndex={wrap ? undefined : 0}
				className="px-[14px] py-[10px] font-mono text-[12px] overflow-x-auto grid grid-cols-[auto_auto_1fr] gap-x-[10px] items-start rounded-b-[10px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2!"
			>
				<TxTraceTree.NodeView
					node={tree}
					depth={0}
					wrap={wrap}
					raw={raw}
					matches={matches}
					ancestorsOfSelection={ancestorsOfSelection}
					collapseKey={collapseKey}
					selectedId={props.selectedId}
					onSelect={props.onSelect}
				/>
			</div>
		</div>
	)
}

/** Deepest frame that reverted — the one that actually explains the failure. */
export function findDeepestFailedNode(
	tree: TxTraceTree.Node | null,
): TxTraceTree.Node | null {
	if (!tree) return null

	let failed: { node: TxTraceTree.Node; depth: number } | null = null
	const stack = [{ node: tree, depth: 0 }]

	while (stack.length > 0) {
		const current = stack.pop()
		if (!current) continue
		if (current.node.hasError) {
			if (!failed || current.depth > failed.depth) failed = current
		}
		for (const child of current.node.children) {
			stack.push({ node: child, depth: current.depth + 1 })
		}
	}

	return failed?.node ?? null
}

function RawToggle(props: {
	raw: boolean
	onToggle: () => void
}): React.JSX.Element {
	return (
		<button
			type="button"
			onClick={props.onToggle}
			className="text-[13px] text-accent hover:underline cursor-pointer press-down"
		>
			{props.raw ? '(raw)' : '(decoded)'}
		</button>
	)
}

/**
 * Decoded view is for reading, not for exactness — a 78-digit uint256 or a
 * 200-character bytes blob wraps the whole tree and hides the arguments beside
 * it. The raw toggle still shows every byte.
 */
function abbreviateTraceValue(value: string, max = 24): string {
	if (value.length <= max) return value
	return `${value.slice(0, max - 8)}…${value.slice(-6)}`
}

/** Past this depth the indent stops growing and becomes a number. */
const MAX_INDENT_DEPTH = 6

/**
 * Ids of frames that match the filter, or have a descendant that does.
 *
 * One post-order pass instead of a subtree walk per rendered node — the latter
 * is O(nodes x depth) and re-ran on every keystroke in the filter box, which is
 * exactly where deep traces are.
 */
function matchingIds(root: TxTraceTree.Node, query: string): Set<string> {
	const ids = new Set<string>()
	const visit = (node: TxTraceTree.Node): boolean => {
		// `haystack` is built once per node at build time, not per visit.
		let hit = node.haystack.includes(query)
		for (const child of node.children) if (visit(child)) hit = true
		if (hit) ids.add(node.id)
		return hit
	}
	visit(root)
	return ids
}

/** Ids of the frames between the root and `id`, exclusive of `id` itself. */
function ancestorIds(root: TxTraceTree.Node, id: string): Set<string> {
	const ids = new Set<string>()
	const visit = (node: TxTraceTree.Node): boolean => {
		if (node.id === id) return true
		for (const child of node.children)
			if (visit(child)) {
				ids.add(node.id)
				return true
			}
		return false
	}
	visit(root)
	return ids
}

/**
 * @param idPrefix Namespace for frame ids. Every tree otherwise starts at
 * `trace-frame-root`, so stacking one tree per call of a batch would emit
 * duplicate DOM ids and make `?frame=` ambiguous about which call it meant.
 */
export function useTraceTree(
	trace: CallTrace | null,
	idPrefix?: string | undefined,
): TxTraceTree.Node | null {
	// Both memoised: a fresh array or callback each render would defeat the
	// builder's memo and rebuild the whole tree on every render.
	const traces = useMemo(() => [trace], [trace])
	const prefixOf = useMemo(
		() => (idPrefix ? () => idPrefix : undefined),
		[idPrefix],
	)
	const trees = useTraceTrees(traces, prefixOf)
	return trees[0] ?? null
}

/**
 * Trees for several traces at once, sharing one ABI batch query.
 *
 * A batch has one trace per call and no single root, so the simulator renders
 * them stacked. Building them through one hook keeps that to a single ABI
 * lookup instead of one per call, and lets callers count frames across the
 * whole bundle without calling a hook in a loop.
 *
 * @param prefixOf Frame-id namespace per index. Required when more than one
 * tree is rendered at a time, or their frame ids collide.
 */
export function useTraceTrees(
	traces: ReadonlyArray<CallTrace | null>,
	prefixOf?: ((index: number) => string) | undefined,
): Array<TxTraceTree.Node | null> {
	const { addresses, selectors } = useMemo(() => {
		const addresses = new Set<`0x${string}`>()
		const selectors = new Set<Hex>()
		const stack = traces.filter((trace): trace is CallTrace => Boolean(trace))
		for (const trace of stack) {
			if (trace.to) addresses.add(trace.to as `0x${string}`)
			const hasSelector = trace.input && trace.input.length >= 10
			if (hasSelector) selectors.add(slice(trace.input, 0, 4))
			const revertData = getRevertData(trace)
			if (revertData && revertData.length >= 10)
				selectors.add(slice(revertData, 0, 4))
			if (trace.calls) stack.push(...trace.calls)
		}
		return {
			addresses: Array.from(addresses),
			selectors: Array.from(selectors),
		}
	}, [traces])

	const queryClient = useQueryClient()

	// Single batch query instead of N+1 individual queries
	const { data: batchData } = useQuery(
		batchAbiQueryOptions({ addresses, selectors }),
	)

	// Populate individual caches for other components
	useEffect(() => {
		if (batchData) populateCacheFromBatch(queryClient, batchData)
	}, [queryClient, batchData])

	return useMemo(() => {
		// Build lookup maps from batch response
		const abiMap = new Map(
			Object.entries(batchData?.abis ?? {}).map(([addr, abi]) => [
				addr.toLowerCase(),
				abi,
			]),
		)
		const sigMap = new Map(
			Object.entries(batchData?.signatures ?? {}).map(([sel, sig]) => [
				sel.toLowerCase(),
				sig,
			]),
		)

		return traces.map((rootTrace, treeIndex) => {
			if (!rootTrace) return null
			const idPrefix = prefixOf?.(treeIndex)
			const failurePath = findDeepestFailurePath(rootTrace)
			let frameIndex = 0

			function buildNode(
				trace: CallTrace,
				path: number[] = [],
			): TxTraceTree.Node {
				const currentFrameIndex = frameIndex++
				const hasSelector = trace.input && trace.input.length >= 10
				const selector = hasSelector ? slice(trace.input, 0, 4) : undefined
				const contractInfo = trace.to ? getContractInfo(trace.to) : undefined
				const precompileInfo = trace.to
					? precompileRegistry.get(trace.to.toLowerCase() as `0x${string}`)
					: undefined

				let functionName: string | undefined
				let params: string | undefined
				let decodedOutput: string | undefined
				const hasError = Boolean(trace.error || trace.revertReason)
				const decodedError = hasError
					? decodeTraceError({
							trace,
							abi: abiMap.get(trace.to?.toLowerCase() ?? '') as
								| Abi
								| null
								| undefined,
							signature: getRevertData(trace)
								? sigMap.get(slice(getRevertData(trace) as Hex, 0, 4))
								: undefined,
						})
					: undefined

				if (precompileInfo && trace.to) {
					const decoded = decodePrecompile(
						trace.to,
						trace.input || '0x',
						trace.output,
					)
					functionName = 'run'
					if (decoded) {
						params = decoded.params
						decodedOutput = decoded.decodedOutput
					}
				} else if (selector) {
					const autoloadAbi = abiMap.get(trace.to?.toLowerCase() ?? '')
					const autoloadAbiItem =
						autoloadAbi && getAbiItem({ abi: autoloadAbi as Abi, selector })

					const contractAbiItem =
						contractInfo?.abi && getAbiItem({ abi: contractInfo.abi, selector })

					const erc20AbiItem = getAbiItem({ abi: erc20Abi, selector })

					const item = autoloadAbiItem || contractAbiItem || erc20AbiItem
					if (item?.name && item.inputs) {
						functionName = item.name
						const rawArgs =
							trace.input.length > 10 ? slice(trace.input, 4) : undefined
						if (rawArgs) {
							try {
								const decoded = decodeAbiParameters(item.inputs, rawArgs)
								params = decoded
									.map((v, i) => {
										const name = item.inputs[i]?.name
										const value = abbreviateTraceValue(formatAbiValue(v))
										return name ? `${name}: ${value}` : value
									})
									.join(', ')
							} catch {
								params = item.inputs
									.map((i) => (i.name ? `${i.name}: ${i.type}` : i.type))
									.join(', ')
							}
						} else {
							params = item.inputs
								.map((i) => (i.name ? `${i.name}: ${i.type}` : i.type))
								.join(', ')
						}

						if (trace.output && trace.output !== '0x' && item.outputs?.length) {
							try {
								decodedOutput = decodeAbiParameters(item.outputs, trace.output)
									.map((v) => abbreviateTraceValue(formatAbiValue(v)))
									.join(', ')
							} catch {
								// keep decodedOutput undefined
							}
						}
					} else {
						// fallback to signature
						const signature = sigMap.get(selector)
						if (signature) {
							const match = signature.match(/^([^(]+)\(([^)]*)\)/)
							if (match) {
								functionName = match[1]
								params = (match[2] ?? '').split(',').join(', ') || undefined
							}
						}
					}
				}

				const children =
					trace.calls?.map((child, index) =>
						buildNode(child, [...path, index]),
					) ?? []
				return {
					trace,
					id: `${idPrefix ? `${idPrefix}-` : ''}trace-frame-${path.length === 0 ? 'root' : path.join('-')}`,
					frameIndex: currentFrameIndex,
					gasUsed: parseInt(trace.gasUsed, 16),
					selector,
					hasInput: hasSelector,
					hasOutput: Boolean(trace.output && trace.output !== '0x'),
					hasError,
					onFailurePath:
						failurePath !== null &&
						path.every((part, index) => failurePath[index] === part),
					hasFailure: failurePath !== null,
					contractName: precompileInfo?.name ?? contractInfo?.name,
					functionName,
					params,
					decodedOutput,
					decodedError,
					// Built here so the filter never rebuilds it per node per keystroke.
					haystack: [
						precompileInfo?.name ?? contractInfo?.name,
						functionName,
						selector,
						trace.to,
						trace.type,
						params,
					]
						.filter(Boolean)
						.join(' ')
						.toLowerCase(),
					children,
					subtreeSize:
						1 + children.reduce((sum, child) => sum + child.subtreeSize, 0),
				}
			}

			return buildNode(rootTrace)
		})
	}, [traces, batchData, prefixOf])
}

export namespace TxTraceTree {
	export interface Props {
		trace: CallTrace | null
		tree?: Node | null | undefined
		/** Header label. Pass `null` when an enclosing section already names it. */
		label?: string | null | undefined
		/**
		 * Render the debugging toolbar (filter, go-to-revert, expand/collapse all)
		 * instead of the transaction page's minimal header. Also flips the wrap
		 * default off, since the toolbar exists where traces get deep.
		 */
		toolbar?: boolean | undefined
		/** Frame id from the URL, shared with the flamegraph. */
		selectedId?: string | undefined
		onSelect?: ((id: string) => void) | undefined
	}

	export interface Node {
		trace: CallTrace
		id: string
		frameIndex: number
		gasUsed: number
		selector?: Hex
		hasInput: boolean
		hasOutput: boolean
		hasError: boolean
		hasFailure: boolean
		onFailurePath: boolean
		contractName?: string
		functionName?: string
		params?: string
		decodedOutput?: string
		decodedError?: DecodedTraceError
		/** Lowercased searchable text for this frame, built once at build time. */
		haystack: string
		children: Node[]
		subtreeSize: number
	}

	export type DecodedError = DecodedTraceError

	/**
	 * How a frame is named wherever it appears — the trace, the flamegraph bar,
	 * the gas table, the answer block. Three private spellings of this had
	 * already drifted apart on address truncation and selector fallback.
	 */
	export function label(node: Node): string {
		const contract =
			node.contractName ??
			(node.trace.to ? HexFormatter.truncate(node.trace.to) : '[create]')
		const fn = node.functionName ?? node.selector
		return fn ? `${contract}.${fn}()` : contract
	}

	export function NodeView(props: NodeView.Props) {
		const { node, depth, wrap, raw, collapseKey, selectedId, onSelect } = props
		const { trace } = node
		const [expanded, setExpanded] = useState(
			!node.hasFailure || node.onFailurePath,
		)
		useEffect(() => {
			setExpanded(!node.hasFailure || node.onFailurePath)
		}, [node.hasFailure, node.onFailurePath])
		// Expand/collapse all. Keyed on a nonce so pressing the same button twice
		// still applies — the user may have toggled individual frames in between.
		useEffect(() => {
			if (collapseKey) setExpanded(!collapseKey.all)
		}, [collapseKey])
		usePermalinkHighlight({
			elementId: node.id,
			onTargetChange: setExpanded,
		})

		const selected = selectedId === node.id
		const holdsSelection = Boolean(props.ancestorsOfSelection?.has(node.id))
		// A frame selected from the flamegraph or the gas table has to be visible
		// when you switch tabs, so its ancestors open themselves.
		useEffect(() => {
			if (holdsSelection) setExpanded(true)
		}, [holdsSelection])

		// Filtering hides whole subtrees that contain no match, rather than
		// flattening — a trace line without its parents is unreadable.
		const matches = !props.matches || props.matches.has(node.id)
		// A filter is a request to see everything that matched, so it overrides the
		// collapse state instead of hiding matches behind a `+`.
		const showChildren = expanded || Boolean(props.matches)

		const displayName = raw
			? trace.input || '0x'
			: node.functionName
				? `${node.functionName}(${node.params || ''})`
				: trace.type === 'CREATE' || trace.type === 'CREATE2'
					? 'new()'
					: node.hasInput
						? `${node.selector}()`
						: 'call()'

		const opLabel =
			trace.type === 'STATICCALL'
				? 'S·CALL'
				: trace.type === 'DELEGATECALL'
					? 'D·CALL'
					: trace.type === 'CREATE2'
						? 'CREATE2'
						: trace.type

		// Short form only — the full decode with named arguments is rendered in
		// the verdict, and inlining every argument here wraps the tree.
		const errorDisplay = node.decodedError
			? formatDecodedTraceErrorShort(node.decodedError)
			: trace.revertReason || trace.error || 'reverted'
		const errorTitle = node.decodedError
			? formatDecodedTraceError(node.decodedError)
			: undefined

		if (!matches) return null

		// Indentation is capped: at 24px per level a nine-deep frame starts off the
		// right edge of the pane. Past the cap the depth is shown as a number
		// instead, which costs one glance and saves the whole line.
		const indentDepth = Math.min(depth, MAX_INDENT_DEPTH)
		const overflowDepth = depth > MAX_INDENT_DEPTH ? depth : 0

		return (
			<>
				<span
					className={cx(
						'text-[10px] font-medium px-[4px] py-px rounded text-center whitespace-nowrap select-none',
						// Neutral by default: the opcode is a label, not a link and not a
						// status. Accent stays reserved for things you can click.
						node.hasError
							? 'bg-negative/15 text-negative'
							: 'bg-distinct text-tertiary',
						depth > 0 && 'mt-[4px]',
					)}
					title={trace.type}
				>
					{opLabel}
				</span>
				<span
					className={cx(
						'text-right tabular-nums select-none',
						// The gas column is a scale, so the eye needs the big numbers to
						// pop out of it — the small ones are noise by definition.
						node.gasUsed >= 100_000 ? 'text-secondary' : 'text-tertiary',
						depth > 0 && 'mt-[4px]',
					)}
					title={`Gas used: ${node.gasUsed.toLocaleString()}`}
				>
					{node.gasUsed.toLocaleString()}
				</span>
				<span
					id={node.id}
					// Selectable only where selection means something (the simulator).
					// On the transaction page the row stays inert markup.
					{...(onSelect
						? {
								role: 'button' as const,
								tabIndex: 0,
								'aria-pressed': selected,
								onClick: () => onSelect(node.id),
								onKeyDown: (event: React.KeyboardEvent) => {
									if (event.key !== 'Enter' && event.key !== ' ') return
									event.preventDefault()
									onSelect(node.id)
								},
							}
						: {})}
					className={cx(
						'inline-flex items-start min-w-0 -mx-[4px] px-[4px] rounded-[3px] transition-colors',
						!wrap && 'whitespace-nowrap',
						depth > 0 && 'mt-[4px]',
						// Hover has to be visible or the click is undiscoverable; it stays
						// fainter than selection so the two never read as the same state.
						onSelect && !selected && 'hover:bg-base-plane-interactive',
						selected && 'bg-accent/10',
						node.onFailurePath && 'border-l-2 border-negative pl-[6px]',
					)}
				>
					<span
						className={cx(
							'inline-flex items-start',
							depth > 0 && 'border-l border-tertiary/40 pl-[8px]',
						)}
						style={
							depth > 0
								? { marginLeft: 16 + (indentDepth - 1) * 20 }
								: undefined
						}
					>
						{overflowDepth > 0 && (
							<span
								className="mr-[5px] mt-[1px] shrink-0 rounded bg-distinct px-[3px] text-[10px] text-tertiary select-none"
								title={`Depth ${overflowDepth}`}
							>
								{overflowDepth}
							</span>
						)}
						<button
							type="button"
							onClick={() => node.children.length > 0 && setExpanded(!expanded)}
							className={cx(
								'shrink-0 size-[16px] text-tertiary mr-[2px] press-down',
								node.children.length > 0 && 'cursor-pointer hover:text-primary',
							)}
							title={expanded ? 'Collapse frame' : 'Expand frame'}
						>
							{node.children.length > 0 ? (
								expanded ? (
									'−'
								) : (
									'+'
								)
							) : (
								<ArrowRightIcon className="size-[12px] mt-[2px]" />
							)}
						</button>
						<span className={cx(wrap && 'break-all', 'min-w-0')}>
							{trace.to ? (
								<Link
									to="/address/$address"
									params={{ address: trace.to }}
									className="text-accent hover:underline press-down inline-block"
									title={trace.to}
								>
									{raw
										? trace.to
										: node.contractName
											? `${node.contractName}(${HexFormatter.truncate(trace.to)})`
											: trace.to}
								</Link>
							) : (
								<span className="text-tertiary">[contract creation]</span>
							)}
							<span className="text-tertiary">{raw ? '::' : '.'}</span>
							<span
								className={
									raw
										? 'text-primary'
										: node.hasError
											? 'text-negative'
											: 'text-code-identifier'
								}
							>
								{displayName}
							</span>
							{node.hasError && (
								<span className="text-negative ml-[4px]" title={errorTitle}>
									[{errorDisplay}]
								</span>
							)}
							{!showChildren && node.subtreeSize > 1 && (
								<button
									type="button"
									onClick={() => setExpanded(true)}
									className="ml-[6px] text-accent hover:underline cursor-pointer"
								>
									+{node.subtreeSize - 1} frames
								</button>
							)}
						</span>
					</span>
				</span>

				{showChildren &&
					node.children.map((child, i) => (
						<NodeView
							key={`${child.trace.to}-${i}`}
							node={child}
							depth={depth + 1}
							wrap={wrap}
							raw={raw}
							matches={props.matches}
							ancestorsOfSelection={props.ancestorsOfSelection}
							collapseKey={collapseKey}
							selectedId={selectedId}
							onSelect={onSelect}
						/>
					))}

				{node.hasOutput && (
					<>
						<span />
						<span />
						<span
							className={cx(
								'inline-flex items-start min-w-0',
								!wrap && 'whitespace-nowrap',
							)}
						>
							<span
								className={cx(
									'inline-flex items-start',
									depth > 0
										? 'border-l border-tertiary/40 pl-[24px]'
										: 'ml-[40px]',
								)}
								style={
									depth > 0
										? { marginLeft: 16 + (indentDepth - 1) * 20 }
										: undefined
								}
							>
								<ReturnIcon className="shrink-0 size-[12px] text-tertiary mr-[4px] mt-[4px]" />
								<span
									className={cx(wrap && 'break-all', 'min-w-0 text-primary')}
								>
									{raw
										? trace.output
										: (node.decodedOutput ??
											abbreviateTraceValue(trace.output ?? '', 42))}
								</span>
							</span>
						</span>
					</>
				)}
			</>
		)
	}

	export namespace NodeView {
		export interface Props {
			node: Node
			depth: number
			wrap: boolean
			raw: boolean
			/** Ids that match the filter; `null` means no filter is active. */
			matches?: Set<string> | null | undefined
			/** Ids on the path to the selected frame, so they open themselves. */
			ancestorsOfSelection?: Set<string> | null | undefined
			/** Expand/collapse all, keyed on a nonce so a repeat press still lands. */
			collapseKey?: { all: boolean; nonce: number } | null | undefined
			selectedId?: string | undefined
			onSelect?: ((id: string) => void) | undefined
		}
	}

	export function toAscii(
		node: Node,
		options: { raw: boolean } = { raw: true },
	): string {
		const { raw } = options

		function render(
			n: Node,
			prefix: string,
			isLast: boolean,
			isRoot: boolean,
		): string {
			const { trace } = n
			const connector = isRoot ? '' : isLast ? '└─ ' : '├─ '
			const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ')

			let addressDisplay: string
			let callDisplay: string
			let output: string | undefined

			if (raw) {
				addressDisplay = trace.to || '[create]'
				callDisplay = n.selector ? `${n.selector}()` : '0x'
				output = trace.output
			} else {
				addressDisplay = n.contractName
					? `${n.contractName}(${trace.to})`
					: trace.to || '[contract creation]'

				if (n.functionName) {
					callDisplay = `${n.functionName}(${n.params || ''})`
				} else if (trace.type === 'CREATE' || trace.type === 'CREATE2') {
					callDisplay = 'new()'
				} else if (n.selector) {
					callDisplay = `${n.selector}()`
				} else {
					callDisplay = 'call()'
				}

				output = n.decodedOutput || trace.output
			}

			const separator = raw ? '::' : '.'
			const line = `${prefix}${connector}[${trace.type}] [${n.gasUsed.toLocaleString()}] ${addressDisplay}${separator}${callDisplay}`

			const lines = [line]

			n.children.forEach((child, i) => {
				const childIsLast = i === n.children.length - 1 && !n.hasOutput
				lines.push(render(child, childPrefix, childIsLast, false))
			})

			if (n.hasOutput && output) {
				lines.push(`${childPrefix}└─ ${output}`)
			}

			return lines.join('\n')
		}

		return render(node, '', true, true)
	}
}
