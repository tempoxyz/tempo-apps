import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { decodeAbiParameters, erc20Abi, slice } from 'viem'
import type { Abi, Hex } from 'viem'
import { cx } from '#lib/css'
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
import { useCopy, usePermalinkHighlight } from '#lib/hooks'
import type { CallTrace } from '#lib/queries'
import { batchAbiQueryOptions, populateCacheFromBatch } from '#lib/queries'
import ArrowRightIcon from '~icons/lucide/arrow-right'
import CopyIcon from '~icons/lucide/copy'
import WrapIcon from '~icons/lucide/corner-down-left'
import ReturnIcon from '~icons/lucide/corner-down-right'

export function TxTraceTree(props: TxTraceTree.Props) {
	const { trace, tree: treeProp, label = 'Execution Trace' } = props
	const [raw, setRaw] = useState(false)
	const [wrap, setWrap] = useState(true)
	const copy = useCopy()

	const builtTree = useTraceTree(treeProp ? null : trace)
	const tree = treeProp ?? builtTree

	if (!tree) return null

	const handleCopy = () => {
		copy.copy(TxTraceTree.toAscii(tree, { raw }))
	}

	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between pl-[16px] pr-[12px] h-[40px] border-b border-dashed border-distinct">
				<span className="text-[13px]">
					{label && (
						<>
							<span className="text-tertiary">{label} </span>
							<RawToggle raw={raw} onToggle={() => setRaw(!raw)} />
						</>
					)}
				</span>
				<div className="flex items-center gap-[8px] text-tertiary">
					{copy.notifying && (
						<span className="text-[11px] select-none">copied</span>
					)}
					{!label && <RawToggle raw={raw} onToggle={() => setRaw(!raw)} />}
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
			<div
				tabIndex={wrap ? undefined : 0}
				className="px-[18px] py-[12px] font-mono text-[12px] overflow-x-auto grid grid-cols-[auto_auto_1fr] gap-x-[8px] items-start rounded-b-[10px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2!"
			>
				<TxTraceTree.NodeView node={tree} depth={0} wrap={wrap} raw={raw} />
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

export function useTraceTree(trace: CallTrace | null): TxTraceTree.Node | null {
	const { addresses, selectors } = useMemo(() => {
		if (!trace)
			return { addresses: [] as `0x${string}`[], selectors: [] as Hex[] }
		const addresses = new Set<`0x${string}`>()
		const selectors = new Set<Hex>()
		const stack = [trace]
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
	}, [trace])

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
		if (!trace) return null

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

		const failurePath = findDeepestFailurePath(trace)
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
				id: `trace-frame-${path.length === 0 ? 'root' : path.join('-')}`,
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
				children,
				subtreeSize:
					1 + children.reduce((sum, child) => sum + child.subtreeSize, 0),
			}
		}

		return buildNode(trace)
	}, [trace, batchData])
}

export namespace TxTraceTree {
	export interface Props {
		trace: CallTrace | null
		tree?: Node | null | undefined
		/** Header label. Pass `null` when an enclosing section already names it. */
		label?: string | null | undefined
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
		children: Node[]
		subtreeSize: number
	}

	export type DecodedError = DecodedTraceError

	export function NodeView(props: NodeView.Props) {
		const { node, depth, wrap, raw } = props
		const { trace } = node
		const [expanded, setExpanded] = useState(
			!node.hasFailure || node.onFailurePath,
		)
		useEffect(() => {
			setExpanded(!node.hasFailure || node.onFailurePath)
		}, [node.hasFailure, node.onFailurePath])
		usePermalinkHighlight({
			elementId: node.id,
			onTargetChange: setExpanded,
		})

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
						'text-tertiary text-right select-none',
						depth > 0 && 'mt-[4px]',
					)}
					title={`Gas used: ${node.gasUsed.toLocaleString()}`}
				>
					{node.gasUsed.toLocaleString()}
				</span>
				<span
					id={node.id}
					className={cx(
						'inline-flex items-start min-w-0',
						!wrap && 'whitespace-nowrap',
						depth > 0 && 'mt-[4px]',
						node.onFailurePath && 'border-l-2 border-negative pl-[6px]',
					)}
				>
					<span
						className={cx(
							'inline-flex items-start',
							depth > 0 && 'border-l border-tertiary/40 pl-[8px]',
						)}
						style={
							depth > 0 ? { marginLeft: 16 + (depth - 1) * 24 } : undefined
						}
					>
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
											? `${node.contractName}(${trace.to})`
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
							{!expanded && node.subtreeSize > 1 && (
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

				{expanded &&
					node.children.map((child, i) => (
						<NodeView
							key={`${child.trace.to}-${i}`}
							node={child}
							depth={depth + 1}
							wrap={wrap}
							raw={raw}
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
									depth > 0 ? { marginLeft: 16 + (depth - 1) * 24 } : undefined
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
