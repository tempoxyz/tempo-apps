import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	Button,
	CopyButton,
	Field,
	formatHex,
	Input,
	style,
	Tooltip,
	variants,
} from '@tempoxyz/ds'
import {
	AlertCircle,
	ArrowCornerDownLeft,
	ArrowCornerDownRight,
	ArrowRight,
	ChevronDown,
	ChevronRight,
	Expand,
	Search,
	Shrink,
} from '@tempoxyz/ds/icons'
import { useEffect, useMemo, useState } from 'react'
import { decodeAbiParameters, slice } from 'viem'
import type { Abi, Hex } from 'viem'
import { cx } from 'zyzz'
import { blockHashHistoryAbi } from '#lib/abis'
import { codeIdentifier, link, linkHover } from '#styles/explorer'
import { PanelToolbar, ViewToggle } from './PanelToolbar'
import {
	blockHashHistoryAddress,
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
import { getKnownTraceAbiItem } from '#lib/domain/trace-abi'
import { usePermalinkHighlight } from '#lib/hooks'
import type { CallTrace } from '#lib/queries'
import { batchAbiQueryOptions, populateCacheFromBatch } from '#lib/queries'

export function TxTraceTree(props: TxTraceTree.Props) {
	const { trace, tree: treeProp, label = 'Execution trace', toolbar } = props
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
	const builtTree = useTraceTree(treeProp ? null : trace)
	const tree = treeProp ?? builtTree
	const ascii = useMemo(
		() => (tree ? TxTraceTree.toAscii(tree, { raw }) : ''),
		[tree, raw],
	)

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

	const isTree = tree.subtreeSize > 1
	// A one-frame trace has nothing to filter, expand, or collapse, and inside a
	// batch it already has a heading above it — so the panel variant draws its
	// toolbar only when there is a tree to work on.
	const showToolbar = toolbar && isTree
	const failedNode = showToolbar ? findDeepestFailedNode(tree) : null

	const modeToggle = (
		<ViewToggle
			label="Trace format"
			value={raw ? 'raw' : 'decoded'}
			options={[
				{ value: 'decoded', label: 'Decoded' },
				{ value: 'raw', label: 'Raw' },
			]}
			onChange={(value) => setRaw(value === 'raw')}
		/>
	)
	const wrapToggle = (
		<PanelToolbar.IconButton
			onClick={() => setWrap(!wrap)}
			active={wrap}
			label={wrap ? 'Disable line wrap' : 'Enable line wrap'}
		>
			<ArrowCornerDownLeft />
		</PanelToolbar.IconButton>
	)
	const copyButton = (
		<CopyButton aria-label="Copy trace" value={ascii} {...styles.shrink()} />
	)

	return (
		<div {...styles.root()}>
			{showToolbar ? (
				<PanelToolbar>
					{/* The field root reports the filled state that shows Clear. */}
					<Field.Root {...styles.filter()}>
						<Input.Group size="small">
							<Input.Prefix>
								<Search />
							</Input.Prefix>
							<Input.Control
								type="search"
								value={query}
								onValueChange={setQuery}
								placeholder="Filter frames…"
								aria-label="Filter frames"
								spellCheck={false}
							/>
							<Input.Clear aria-label="Clear search" />
						</Input.Group>
					</Field.Root>
					{failedNode && (
						<Button
							size="small"
							variant="secondary"
							onClick={() => props.onSelect?.(failedNode.id)}
						>
							<AlertCircle />
							Go to revert
						</Button>
					)}
					<PanelToolbar.IconButton
						onClick={() =>
							setCollapseKey({
								all: false,
								nonce: (collapseKey?.nonce ?? 0) + 1,
							})
						}
						label="Expand all frames"
					>
						<Expand />
					</PanelToolbar.IconButton>
					<PanelToolbar.IconButton
						onClick={() =>
							setCollapseKey({
								all: true,
								nonce: (collapseKey?.nonce ?? 0) + 1,
							})
						}
						label="Collapse all frames"
					>
						<Shrink />
					</PanelToolbar.IconButton>
					{wrapToggle}
					{copyButton}
					{modeToggle}
				</PanelToolbar>
			) : label ? (
				<Tooltip.Provider>
					<div {...styles.header()}>
						<span {...styles.headerLabel()}>{label}</span>
						<div {...styles.headerActions()}>
							{copyButton}
							{wrapToggle}
							{modeToggle}
						</div>
					</div>
				</Tooltip.Provider>
			) : null}
			<Tooltip.Provider>
				{/* Unwrapped lines scroll sideways, so the region then takes focus for
				    the keyboard. */}
				<section
					aria-label="Call trace"
					tabIndex={wrap ? undefined : 0}
					{...styles.frames()}
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
				</section>
			</Tooltip.Provider>
		</div>
	)
}

/** Shows or hides a frame's children. */
function FrameToggle(props: {
	expanded: boolean
	/** Frames under this one, named in the label while they are hidden. */
	frames: number
	onToggle: () => void
}): React.JSX.Element {
	const label = props.expanded
		? 'Collapse frame'
		: `Expand ${props.frames} ${props.frames === 1 ? 'frame' : 'frames'}`
	return (
		<Tooltip.Root>
			<Tooltip.Trigger
				render={
					<Button
						aria-expanded={props.expanded}
						aria-label={label}
						onClick={(event) => {
							// The frame around it selects on click; a toggle only toggles.
							event.stopPropagation()
							props.onToggle()
						}}
						shape="icon"
						size="small"
						variant="text"
						{...styles.shrink()}
					/>
				}
			>
				{props.expanded ? <ChevronDown /> : <ChevronRight />}
			</Tooltip.Trigger>
			<Tooltip.Popup>{label}</Tooltip.Popup>
		</Tooltip.Root>
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

/** Keep byte arguments and return values compact; the raw view preserves them. */
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
				parentTrace?: CallTrace,
			): TxTraceTree.Node {
				const currentFrameIndex = frameIndex++
				const hasSelector = trace.input && trace.input.length >= 10
				const selector = hasSelector ? slice(trace.input, 0, 4) : undefined
				const contractInfo = trace.to ? getContractInfo(trace.to) : undefined
				const precompileInfo = trace.to
					? precompileRegistry.get(trace.to.toLowerCase() as `0x${string}`)
					: undefined
				const isBlockHashHistory =
					trace.to?.toLowerCase() === blockHashHistoryAddress

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

				if (precompileInfo && precompileInfo.abi.length === 0 && trace.to) {
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
				} else if (isBlockHashHistory) {
					const [getBlockHash] = blockHashHistoryAbi
					try {
						const [blockNumber] = decodeAbiParameters(
							getBlockHash.inputs,
							trace.input,
						)
						functionName = getBlockHash.name
						params = `blockNumber: ${blockNumber}`
						if (trace.output && trace.output !== '0x') {
							const [blockHash] = decodeAbiParameters(
								getBlockHash.outputs,
								trace.output,
							)
							decodedOutput = blockHash
						}
					} catch {
						// EIP-2935 rejects malformed raw calldata.
					}
				} else if (selector) {
					const autoloadAbi = abiMap.get(trace.to?.toLowerCase() ?? '')
					const autoloadAbiItem =
						autoloadAbi && getAbiItem({ abi: autoloadAbi as Abi, selector })

					const contractAbiItem =
						contractInfo?.abi && getAbiItem({ abi: contractInfo.abi, selector })

					const knownAbiItem = getKnownTraceAbiItem(selector)

					const item = autoloadAbiItem || contractAbiItem || knownAbiItem
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
										const formatted = formatAbiValue(v)
										const value =
											item.inputs[i]?.type === 'bytes'
												? abbreviateTraceValue(formatted)
												: formatted
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
				if (trace.type === 'DELEGATECALL' && parentTrace?.input === trace.input)
					params = 'same args as parent'

				const children =
					trace.calls?.map((child, index) =>
						buildNode(child, [...path, index], trace),
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
			(node.trace.to ? formatHex(node.trace.to) : '[create]')
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
				{/* Neutral by default: the opcode is a label, not a link and not a
				    status. Accent stays reserved for things you can click. */}
				<span {...styles.opcode({ failed: node.hasError })} title={trace.type}>
					{opLabel}
				</span>
				{/* The gas column is a scale, so the big numbers stand out of it. */}
				<span {...styles.gas({ large: node.gasUsed >= 100_000 })}>
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
									// Keys on the toggle or the address link are theirs.
									if (event.target !== event.currentTarget) return
									if (event.key !== 'Enter' && event.key !== ' ') return
									event.preventDefault()
									onSelect(node.id)
								},
							}
						: {})}
					{...styles.frame({ failure: node.onFailurePath, wrap })}
				>
					<span
						{...cx(
							styles.indent(),
							depth > 0 &&
								styles.indentNested({
									style: { marginLeft: 16 + (indentDepth - 1) * 20 },
								}),
						)}
					>
						{overflowDepth > 0 && (
							<span {...styles.depthBadge()} title={`Depth ${overflowDepth}`}>
								{overflowDepth}
							</span>
						)}
						{node.children.length > 0 ? (
							<FrameToggle
								expanded={showChildren}
								frames={node.subtreeSize - 1}
								onToggle={() => setExpanded(!expanded)}
							/>
						) : (
							<span {...styles.leaf()}>
								<ArrowRight {...styles.leafIcon()} />
							</span>
						)}
						<span {...cx(styles.label(), wrap && styles.breakAll())}>
							{trace.to ? (
								<Link
									to="/address/$address"
									params={{ address: trace.to }}
									{...cx(styles.address(), link(), linkHover())}
									title={trace.to}
								>
									{raw
										? trace.to
										: node.contractName
											? `${node.contractName}(${formatHex(trace.to)})`
											: trace.to}
								</Link>
							) : (
								<span {...styles.secondary()}>[contract creation]</span>
							)}
							<span {...styles.tertiary()}>{raw ? '::' : '.'}</span>
							<span {...cx(raw && styles.primary(), !raw && codeIdentifier())}>
								{displayName}
							</span>
							{node.hasError && (
								<span {...styles.errorText()} title={errorTitle}>
									[{errorDisplay}]
								</span>
							)}
							{!showChildren && node.subtreeSize > 1 && (
								<span {...styles.hiddenFrames()}>
									{node.subtreeSize - 1} hidden
								</span>
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
						<span {...styles.output({ wrap })}>
							<span
								{...cx(
									styles.indent(),
									depth === 0 && styles.outputRoot(),
									depth > 0 &&
										styles.outputNested({
											style: { marginLeft: 16 + (indentDepth - 1) * 20 },
										}),
								)}
							>
								<ArrowCornerDownRight {...styles.returnIcon()} />
								<span {...cx(styles.outputValue(), wrap && styles.breakAll())}>
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

namespace styles {
	export const root = style({
		display: 'flex',
		flexDirection: 'column',
		minWidth: '0 !custom',
	})

	export const tertiary = style({ color: 'gray.700' })

	export const secondary = style({ color: 'gray.900' })

	export const primary = style({ color: 'foreground' })

	export const shrink = style({ flexShrink: 0 })

	// Sized beside the toolbar's 32px controls.
	export const filter = style({
		marginRight: 'auto !custom',
		maxWidth: '100% !custom',
		width: '240',
	})

	export const header = style({
		alignItems: 'center',
		borderBottomWidth: '1',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		minHeight: '48',
		paddingBlock: '8',
		paddingLeft: '16',
		paddingRight: '8',
	})

	export const headerLabel = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const headerActions = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
	})

	export const frames = style({
		alignItems: 'center',
		borderBottomLeftRadius: '12',
		borderBottomRightRadius: '12',
		columnGap: '8',
		display: 'grid',
		gridTemplateColumns: 'auto auto 1fr',
		overflowX: 'auto',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'label.12.mono',
		// Focusable so it can be scrolled by keyboard; an inset ring is not
		// clipped by its own overflow.
		':focus-visible': {
			outline: '2px solid currentColor !custom',
			outlineOffset: '-2px !custom',
		},
	})

	export const breakAll = style({ wordBreak: 'break-all' })

	// Rows inherit the grid's mono face; only the colour changes here.
	export const opcode = variants({
		base: {
			backgroundColor: 'grayAlpha.100',
			borderRadius: '4',
			color: 'gray.900',
			paddingBlock: '1',
			paddingInline: '4',
			textAlign: 'center',
			userSelect: 'none',
			whiteSpace: 'nowrap',
		},
		defaultVariants: { failed: false },
		variants: {
			failed: {
				false: {},
				true: { backgroundColor: 'red.100', color: 'foreground' },
			},
		},
	})

	export const gas = variants({
		base: {
			color: 'gray.900',
			fontVariantNumeric: 'tabular-nums',
			textAlign: 'right',
			userSelect: 'none',
		},
		defaultVariants: { large: false },
		variants: {
			large: { false: {}, true: { color: 'foreground' } },
		},
	})

	// Selectable frames (role="button") show hover fainter than selection, so
	// the two never read as the same state.
	export const frame = variants({
		base: {
			alignItems: 'center',
			borderRadius: '4',
			display: 'inline-flex',
			marginInline: '-4px !custom',
			minWidth: '0 !custom',
			paddingLeft: '4',
			paddingRight: '4',
			':focus-visible': {
				outline: '2px solid currentColor !custom',
				outlineOffset: '0px !custom',
			},
			'@media (hover: hover)': {
				selectors: {
					'&[role="button"]:not([aria-pressed="true"]):hover': {
						backgroundColor: 'grayAlpha.100',
					},
				},
			},
			selectors: {
				'&[aria-pressed="true"]': { backgroundColor: 'grayAlpha.200' },
			},
		},
		defaultVariants: { failure: false, wrap: true },
		variants: {
			failure: {
				false: {},
				true: {
					borderColor: 'red.900',
					borderLeftWidth: '2',
					borderStyle: 'solid',
					paddingLeft: '6px !custom',
				},
			},
			wrap: { false: { whiteSpace: 'nowrap' }, true: {} },
		},
	})

	export const indent = style({
		alignItems: 'center',
		display: 'inline-flex',
	})

	export const indentNested = style({
		alignSelf: 'stretch',
		borderColor: 'grayAlpha.300',
		borderLeftWidth: '1',
		borderStyle: 'solid',
		paddingLeft: '8',
	})

	export const depthBadge = style({
		backgroundColor: 'grayAlpha.100',
		borderRadius: '4',
		color: 'gray.900',
		flexShrink: 0,
		marginRight: '4',
		paddingInline: '2px !custom',
		userSelect: 'none',
	})

	// Takes a toggle's place on a leaf, so labels line up.
	export const leaf = style({
		alignItems: 'center',
		display: 'flex',
		flexShrink: 0,
		height: '32',
		justifyContent: 'center',
		width: '32',
	})

	export const leafIcon = style({
		color: 'gray.700',
		height: '12',
		width: '12',
	})

	export const label = style({ minWidth: '0 !custom' })

	export const address = style({ display: 'inline-block' })

	export const errorText = style({
		color: 'foreground',
		marginLeft: '4',
	})

	export const hiddenFrames = style({ color: 'gray.900', marginLeft: '8' })

	export const output = variants({
		base: {
			alignItems: 'flex-start',
			display: 'inline-flex',
			minWidth: '0 !custom',
		},
		defaultVariants: { wrap: true },
		variants: {
			wrap: { false: { whiteSpace: 'nowrap' }, true: {} },
		},
	})

	// Return values start under the frame label, past its toggle.
	export const outputRoot = style({ marginLeft: '32' })

	export const outputNested = style({
		borderColor: 'grayAlpha.300',
		borderLeftWidth: '1',
		borderStyle: 'solid',
		paddingLeft: '40',
	})

	export const returnIcon = style({
		color: 'gray.700',
		flexShrink: 0,
		height: '12',
		marginRight: '4',
		marginTop: '2px !custom',
		width: '12',
	})

	export const outputValue = style({
		color: 'foreground',
		minWidth: '0 !custom',
	})
}
