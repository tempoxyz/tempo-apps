import { useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { Hex } from 'viem'
import { type Abi, decodeAbiParameters, erc20Abi, slice } from 'viem'
import { cx } from '#cva.config.ts'
import {
	formatAbiValue,
	getAbiItem,
	getContractInfo,
} from '#lib/domain/contracts'
import { useCopy } from '#lib/hooks'
import type { CallTrace } from '#lib/queries'
import {
	autoloadAbiQueryOptions,
	lookupSignatureQueryOptions,
} from '#lib/queries'
import ArrowRightIcon from '~icons/lucide/arrow-right'
import CopyIcon from '~icons/lucide/copy'
import WrapIcon from '~icons/lucide/corner-down-left'
import ReturnIcon from '~icons/lucide/corner-down-right'

export function TxTraceTree(props: TxTraceTree.Props) {
	const { trace } = props
	const [raw, setRaw] = useState(false)
	const [wrap, setWrap] = useState(true)
	const copy = useCopy()

	const tree = useTraceTree(trace)

	if (!trace || !tree) return null

	const handleCopy = () => {
		copy.copy(TxTraceTree.toAscii(tree, { raw }))
	}

	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between pl-[16px] pr-[12px] h-[40px] border-b border-dashed border-distinct">
				<span className="text-[13px]">
					<span className="text-tertiary">Execution Trace</span>{' '}
					<button
						type="button"
						onClick={() => setRaw(!raw)}
						className="text-accent hover:underline cursor-pointer press-down"
					>
						{raw ? '(raw)' : '(decoded)'}
					</button>
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
			<div
				tabIndex={wrap ? undefined : 0}
				className="px-[18px] py-[12px] font-mono text-[12px] overflow-x-auto grid grid-cols-[auto_auto_1fr] gap-x-[8px] items-start rounded-b-[10px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2!"
			>
				<TxTraceTree.NodeView node={tree} depth={0} wrap={wrap} raw={raw} />
			</div>
		</div>
	)
}

function useTraceTree(trace: CallTrace | null): TxTraceTree.Node | null {
	const { addresses, selectors } = useMemo(() => {
		if (!trace) return { addresses: [] as string[], selectors: [] as Hex[] }
		const addresses = new Set<string>()
		const selectors = new Set<Hex>()
		const stack = [trace]
		for (const trace of stack) {
			if (trace.to) addresses.add(trace.to)
			const hasSelector = trace.input && trace.input.length >= 10
			if (hasSelector) selectors.add(slice(trace.input, 0, 4))
			if (trace.calls) stack.push(...trace.calls)
		}
		return {
			addresses: Array.from(addresses),
			selectors: Array.from(selectors),
		}
	}, [trace])

	const abiQueries = useQueries({
		queries: addresses.map((address) =>
			autoloadAbiQueryOptions({ address: address as `0x${string}` }),
		),
	})

	const sigQueries = useQueries({
		queries: selectors.map((selector) =>
			lookupSignatureQueryOptions({ selector }),
		),
	})

	return useMemo(() => {
		if (!trace) return null

		const abiMap = new Map(
			addresses.map((addr, i) => [addr, abiQueries[i]?.data]),
		)
		const sigMap = new Map(
			selectors.map((sel, i) => [sel, sigQueries[i]?.data]),
		)

		function buildNode(trace: CallTrace): TxTraceTree.Node {
			const hasSelector = trace.input && trace.input.length >= 10
			const selector = hasSelector ? slice(trace.input, 0, 4) : undefined
			const contractInfo = trace.to ? getContractInfo(trace.to) : undefined

			// try to decode function call
			let functionName: string | undefined
			let params: string | undefined
			let decodedOutput: string | undefined

			if (selector) {
				const autoloadAbi = abiMap.get(trace.to ?? '')
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
									const value = formatAbiValue(v)
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
								.map((v) => formatAbiValue(v))
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

			return {
				trace,
				gasUsed: parseInt(trace.gasUsed, 16),
				selector,
				hasInput: hasSelector,
				hasOutput: Boolean(trace.output && trace.output !== '0x'),
				hasError: Boolean(trace.error || trace.revertReason),
				contractName: contractInfo?.name,
				functionName,
				params,
				decodedOutput,
				children: trace.calls?.map(buildNode) ?? [],
			}
		}

		return buildNode(trace)
	}, [trace, addresses, selectors, abiQueries, sigQueries])
}

export namespace TxTraceTree {
	export interface Props {
		trace: CallTrace | null
	}

	export interface Node {
		trace: CallTrace
		gasUsed: number
		selector?: Hex
		hasInput: boolean
		hasOutput: boolean
		hasError: boolean
		contractName?: string
		functionName?: string
		params?: string
		decodedOutput?: string
		children: Node[]
	}

	export function NodeView(props: NodeView.Props) {
		const { node, depth, wrap, raw } = props
		const { trace } = node

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

		return (
			<>
				<span
					className={cx(
						'text-[10px] font-medium px-[4px] py-px rounded text-center whitespace-nowrap select-none',
						node.hasError
							? 'bg-negative/20 text-negative'
							: 'bg-accent/20 text-accent',
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
					className={cx(
						'inline-flex items-start min-w-0',
						!wrap && 'whitespace-nowrap',
						depth > 0 && 'mt-[4px]',
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
						<ArrowRightIcon className="shrink-0 size-[12px] text-tertiary mr-[4px] mt-[4px]" />
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
											: 'text-base-content-positive'
								}
							>
								{displayName}
							</span>
							{node.hasError && (
								<span className="text-negative ml-[4px]">
									[{trace.revertReason || trace.error || 'reverted'}]
								</span>
							)}
						</span>
					</span>
				</span>

				{node.children.map((child, i) => (
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
									{raw ? trace.output : node.decodedOutput || trace.output}
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
