import { Link } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { getSignature } from 'ox/AbiItem'
import * as React from 'react'
import { decodeFunctionResult, encodeFunctionData } from 'viem'
import type { Abi, AbiFunction } from 'viem'
import { useCall, useReadContract } from 'wagmi'
import { cx } from '#lib/css'
import { ellipsis } from '#lib/chars'
import {
	formatOutputValue,
	getFunctionSelector,
	getInputFunctions,
	getInputType,
	getNoInputFunctions,
	getPlaceholder,
	isArrayType,
	parseInputValue,
} from '#lib/domain/contracts'
import { useCopy, useCopyPermalink, usePermalinkHighlight } from '#lib/hooks'
import CheckIcon from '~icons/lucide/check'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import ChevronsUpDownIcon from '~icons/lucide/chevrons-up-down'
import CopyIcon from '~icons/lucide/copy'
import ReturnIcon from '~icons/lucide/corner-down-right'
import LinkIcon from '~icons/lucide/link'
import PlayIcon from '~icons/lucide/play'

type ReadFunction = AbiFunction & { stateMutability: 'view' | 'pure' }

export function ContractReader(props: {
	address: Address.Address
	abi: Abi
	docsUrl?: string
}) {
	const { address, abi } = props

	const key = React.useId()

	const noInputFunctions = getNoInputFunctions(abi)
	const inputFunctions = getInputFunctions(abi)

	return (
		<div className="flex flex-col gap-[12px]">
			{/* Functions without inputs - show as static values */}
			{noInputFunctions.map((fn) => (
				<StaticReadFunction
					key={`${fn.name}-${fn.inputs?.length ?? 0}-${address}`}
					address={address}
					abi={abi}
					fn={fn}
				/>
			))}

			{/* Functions with inputs - show as expandable forms */}
			{inputFunctions.map((fn) => (
				<DynamicReadFunction
					key={`${fn.name}-${key}-${fn.inputs?.length}`}
					address={address}
					abi={abi}
					fn={fn}
				/>
			))}

			{noInputFunctions.length === 0 && inputFunctions.length === 0 && (
				<p className="text-[13px] text-tertiary">
					No read functions available.
				</p>
			)}
		</div>
	)
}

/**
 * Get a display-friendly function signature.
 * Uses getSignature for named functions, falls back to selector for unnamed (whatsabi).
 */
function getFunctionDisplaySignature(fn: AbiFunction): string {
	if (fn.name) return getSignature(fn).replace(/,/g, ', ')
	// Fallback for whatsabi-extracted functions without names
	const selector = getFunctionSelector(fn)
	const inputs = fn.inputs?.map((i) => i.type).join(', ') ?? ''
	return `${selector}(${inputs})`
}

/**
 * Get method name with selector, e.g., "approve (0x095ea7b3)"
 */
function getMethodWithSelector(fn: AbiFunction): string {
	const selector = getFunctionSelector(fn)
	const name = fn.name || selector
	return `${name} (${selector})`
}

function Expandable(props: {
	className?: string
	expanded?: boolean
	lineHeight?: number
	onOverflowChange?: (overflows: boolean) => void
	rows?: number
	value: string
}) {
	const {
		className,
		expanded,
		lineHeight = 20,
		onOverflowChange,
		rows = 8,
		value,
	} = props
	const contentRef = React.useRef<HTMLDivElement>(null)

	React.useEffect(() => {
		const el = contentRef.current
		if (!el) return
		const onResize = () =>
			onOverflowChange?.(el.scrollHeight > lineHeight * rows)
		onResize()
		const observer = new ResizeObserver(onResize)
		observer.observe(el)
		return () => observer.disconnect()
	}, [onOverflowChange, lineHeight, rows])

	return (
		<div
			ref={contentRef}
			style={{
				maxHeight: expanded ? undefined : lineHeight * rows,
				lineHeight: `${20}px`,
			}}
			className={cx(
				'text-primary overflow-auto text-[13px] font-mono outline-focus focus-visible:outline-2 outline-offset-1 rounded-[4px]',
				className,
			)}
		>
			{value}
		</div>
	)
}

function StaticReadFunction(props: {
	address: Address.Address
	abi: Abi
	fn: ReadFunction
}) {
	const { address, abi, fn } = props
	const { copy, notifying: copyNotifying } = useCopy({ timeout: 2_000 })
	const [expanded, setExpanded] = React.useState(false)
	const [overflows, setOverflows] = React.useState(false)

	const [mounted, setMounted] = React.useState(false)
	React.useEffect(() => setMounted(true), [])

	const selector = getFunctionSelector(fn)
	const fnId = fn.name || selector
	usePermalinkHighlight({ elementId: fnId })

	const hasOutputs = Array.isArray(fn.outputs) && fn.outputs.length > 0

	const {
		data: typedResult,
		error: typedError,
		isLoading: typedLoading,
		isFetching: typedFetching,
		refetch: typedRefetch,
	} = useReadContract({
		address,
		abi,
		functionName: fn.name,
		args: [],
		query: { enabled: mounted && hasOutputs },
	})

	// Raw call fallback for functions without outputs
	const callData = React.useMemo(() => {
		if (hasOutputs) return undefined
		try {
			return encodeFunctionData({ abi, functionName: fn.name, args: [] })
		} catch {
			return undefined
		}
	}, [abi, fn.name, hasOutputs])

	const {
		data: rawResult,
		error: rawError,
		isLoading: rawLoading,
		isFetching: rawFetching,
		refetch: rawRefetch,
	} = useCall({
		to: address,
		data: callData,
		query: { enabled: mounted && !hasOutputs && Boolean(callData) },
	})

	const refetch = hasOutputs ? typedRefetch : rawRefetch
	const isFetching = hasOutputs ? typedFetching : rawFetching

	const decodedRawResult = React.useMemo(() => {
		if (hasOutputs || !rawResult?.data) return undefined
		const data = rawResult.data

		// Check if it looks like a padded address (32 bytes with 12 leading zero bytes)
		// Address encoding: 0x + 24 zeros + 40 hex chars (20 bytes address)
		const looksLikeAddress =
			data.length === 66 &&
			data.slice(2, 26) === '000000000000000000000000' &&
			data.slice(26) !== '0000000000000000000000000000000000000000'

		if (looksLikeAddress) {
			try {
				const addressAbi = [{ ...fn, outputs: [{ type: 'address', name: '' }] }]
				return decodeFunctionResult({
					abi: addressAbi,
					functionName: fn.name,
					data,
				})
			} catch {
				// Fall through to other attempts
			}
		}

		// Try decoding as string (common for functions like typeAndVersion)
		try {
			const stringAbi = [{ ...fn, outputs: [{ type: 'string', name: '' }] }]
			return decodeFunctionResult({
				abi: stringAbi,
				functionName: fn.name,
				data,
			})
		} catch {
			// Fall through
		}

		// Try decoding as uint256 (common for numeric getters)
		try {
			const uint256Abi = [{ ...fn, outputs: [{ type: 'uint256', name: '' }] }]
			return decodeFunctionResult({
				abi: uint256Abi,
				functionName: fn.name,
				data,
			})
		} catch {
			// Return raw hex if all decode attempts fail
			return data
		}
	}, [hasOutputs, rawResult, fn])

	const isLoading = !mounted || (hasOutputs ? typedLoading : rawLoading)
	const result = hasOutputs ? typedResult : decodedRawResult
	const queryError = hasOutputs ? typedError : rawError
	const error = queryError ? queryError.message : null

	const isResultAddress = typeof result === 'string' && Address.validate(result)
	const outputType =
		fn.outputs?.[0]?.type ?? (isResultAddress ? 'address' : 'string')

	const displayValue = error
		? error
		: isLoading
			? ellipsis
			: formatOutputValue(result, outputType)

	// Format address outputs as links (only after mount to avoid hydration mismatch)
	const isAddressOutput = outputType === 'address' || isResultAddress
	const isValidAddress = mounted && isAddressOutput && isResultAddress

	const handleCopyMethod = () => {
		void copy(getMethodWithSelector(fn))
	}

	const { linkNotifying, handleCopyPermalink } = useCopyPermalink({
		fragment: fnId,
	})

	return (
		<div
			id={fnId}
			className="flex flex-col rounded-[8px] border border-card-border bg-surface overflow-hidden"
		>
			<div className="flex items-center justify-between gap-[8px]">
				<span className="text-[12px] text-secondary font-mono py-[10px] pl-[12px]">
					{getFunctionDisplaySignature(fn)}
				</span>
				<div className="flex items-center pl-[12px]">
					<button
						type="button"
						onClick={handleCopyMethod}
						title={copyNotifying ? 'Copied!' : 'Copy method name'}
						className="cursor-pointer press-down text-tertiary hover:text-primary h-full py-[10px] px-[4px] focus-visible:-outline-offset-2!"
					>
						{copyNotifying ? (
							<CheckIcon className="w-[12px] h-[12px]" />
						) : (
							<CopyIcon className="w-[12px] h-[12px]" />
						)}
					</button>
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation()
							void handleCopyPermalink()
						}}
						title={linkNotifying ? 'Copied!' : 'Copy permalink'}
						className="cursor-pointer press-down text-tertiary hover:text-primary h-full py-[10px] px-[4px] focus-visible:-outline-offset-2!"
					>
						{linkNotifying ? (
							<CheckIcon className="w-[12px] h-[12px]" />
						) : (
							<LinkIcon className="w-[12px] h-[12px]" />
						)}
					</button>
					<button
						type="button"
						onClick={() => void refetch()}
						title="Refresh"
						disabled={isFetching}
						className={cx(
							'text-accent cursor-pointer press-down h-full py-[10px] pl-[4px] focus-visible:-outline-offset-2!',
							overflows ? 'pr-[4px]' : 'pr-[12px]',
							isFetching && 'opacity-50 cursor-not-allowed',
						)}
					>
						<PlayIcon className="size-[14px]" />
					</button>
					{overflows && (
						<button
							type="button"
							onClick={() => setExpanded((v) => !v)}
							title={expanded ? 'Collapse' : 'Expand'}
							className="cursor-pointer press-down text-tertiary hover:text-primary h-full py-[10px] pl-[4px] pr-[12px] focus-visible:-outline-offset-2!"
						>
							<ChevronsUpDownIcon className="w-[12px] h-[12px]" />
						</button>
					)}
				</div>
			</div>
			<div className="border-t border-card-border px-[12px] py-[10px] flex">
				<ReturnIcon className="shrink-0 size-[12px] text-tertiary mr-[6px] mt-[4px]" />
				{isFetching || isLoading ? (
					<div className="text-[13px] text-secondary leading-[20px]">
						{ellipsis}
					</div>
				) : isValidAddress ? (
					<div className="text-[13px] leading-[20px]">
						<Link
							to="/address/$address"
							params={{ address: result as Address.Address }}
							className="text-accent hover:text-accent/80"
						>
							{displayValue}
						</Link>
					</div>
				) : (
					<Expandable
						expanded={expanded}
						onOverflowChange={setOverflows}
						className={cx(error ? 'text-red-400' : 'text-primary')}
						value={displayValue}
					/>
				)}
			</div>
		</div>
	)
}

function DynamicReadFunction(props: {
	address: Address.Address
	abi: Abi
	fn: ReadFunction
}) {
	const { address, abi, fn } = props
	const [inputs, setInputs] = React.useState<Record<string, string>>({})
	const { copy, notifying: copyNotifying } = useCopy({ timeout: 2_000 })

	const selector = getFunctionSelector(fn)
	const fnId = fn.name || selector

	const [isExpanded, setIsExpanded] = React.useState(false)
	const handleTargetChange = React.useCallback(
		(isTarget: boolean) => isTarget && setIsExpanded(true),
		[],
	)
	usePermalinkHighlight({ elementId: fnId, onTargetChange: handleTargetChange })

	const handleInputChange = (name: string, value: string) => {
		setInputs((prev) => ({ ...prev, [name]: value }))
	}

	const allInputsFilled = (fn.inputs ?? []).every((input, index) => {
		const key = input.name ?? `arg${index}`
		const value = inputs[key]
		return value !== undefined && value.trim() !== ''
	})

	const parsedArgs = React.useMemo(() => {
		if (!allInputsFilled) return { args: [] as Array<unknown>, error: null }
		try {
			const args = (fn.inputs ?? []).map((input, index) => {
				const key = input.name ?? `arg${index}`
				const value = inputs[key] ?? ''
				return parseInputValue(value, input.type)
			})
			return { args, error: null }
		} catch (err) {
			return {
				args: [] as Array<unknown>,
				error: err instanceof Error ? err.message : 'Failed to parse inputs',
			}
		}
	}, [fn.inputs, inputs, allInputsFilled])

	const hasOutputs = Array.isArray(fn.outputs) && fn.outputs.length > 0

	const {
		data: typedResult,
		error: typedError,
		isFetching: typedFetching,
		refetch: typedRefetch,
	} = useReadContract({
		address,
		abi,
		functionName: fnId,
		args: parsedArgs.args,
		query: {
			enabled: allInputsFilled && !parsedArgs.error && hasOutputs,
		},
	})

	// Raw call fallback for functions without outputs
	const callData = React.useMemo(() => {
		if (hasOutputs || !allInputsFilled || parsedArgs.error) return undefined
		try {
			return encodeFunctionData({
				abi,
				functionName: fn.name,
				args: parsedArgs.args,
			})
		} catch {
			return undefined
		}
	}, [abi, fn.name, hasOutputs, allInputsFilled, parsedArgs])

	const {
		data: rawResult,
		error: rawError,
		isFetching: rawFetching,
		refetch: rawRefetch,
	} = useCall({
		to: address,
		data: callData,
		query: {
			enabled:
				!hasOutputs &&
				allInputsFilled &&
				!parsedArgs.error &&
				Boolean(callData),
		},
	})

	const refetch = hasOutputs ? typedRefetch : rawRefetch
	const isFetching = hasOutputs ? typedFetching : rawFetching

	const decodedRawResult = React.useMemo(() => {
		if (hasOutputs || !rawResult?.data) return undefined
		const data = rawResult.data

		// Check if it looks like a padded address
		const looksLikeAddress =
			data.length === 66 &&
			data.slice(2, 26) === '000000000000000000000000' &&
			data.slice(26) !== '0000000000000000000000000000000000000000'

		if (looksLikeAddress) {
			try {
				const addressAbi = [{ ...fn, outputs: [{ type: 'address', name: '' }] }]
				return decodeFunctionResult({
					abi: addressAbi,
					functionName: fn.name,
					data,
				})
			} catch {
				// Fall through
			}
		}

		// Try decoding as uint256 (common for balanceOf, etc.)
		try {
			const uint256Abi = [{ ...fn, outputs: [{ type: 'uint256', name: '' }] }]
			return decodeFunctionResult({
				abi: uint256Abi,
				functionName: fn.name,
				data,
			})
		} catch {
			// Fall through
		}

		// Try decoding as string
		try {
			const stringAbi = [{ ...fn, outputs: [{ type: 'string', name: '' }] }]
			return decodeFunctionResult({
				abi: stringAbi,
				functionName: fn.name,
				data,
			})
		} catch {
			// Return raw hex if all decode attempts fail
			return data
		}
	}, [hasOutputs, rawResult, fn])

	const result = hasOutputs ? typedResult : decodedRawResult
	const queryError = hasOutputs ? typedError : rawError

	const error =
		parsedArgs.error ?? (queryError ? queryError.message : null) ?? null

	const isResultAddress =
		typeof result === 'string' && Address.validate(result as string)
	const outputType =
		fn.outputs?.[0]?.type ?? (isResultAddress ? 'address' : 'uint256')

	const handleCopyMethod = (e: React.MouseEvent) => {
		e.stopPropagation()
		void copy(getMethodWithSelector(fn))
	}

	const { linkNotifying, handleCopyPermalink } = useCopyPermalink({
		fragment: fnId,
	})

	return (
		<div
			id={fnId}
			className="rounded-[8px] border border-card-border bg-surface overflow-hidden"
		>
			<div className="w-full flex items-center justify-between">
				<button
					type="button"
					onClick={() => setIsExpanded(!isExpanded)}
					className="flex-1 text-left h-full py-[10px] pl-[12px] cursor-pointer press-down focus-visible:-outline-offset-2! focus-visible:rounded-l-[8px]!"
				>
					<span className="text-[12px] text-secondary font-mono">
						{getFunctionDisplaySignature(fn)}
					</span>
				</button>
				<div className="flex items-center pl-[12px]">
					<button
						type="button"
						onClick={handleCopyMethod}
						title={copyNotifying ? 'Copied!' : 'Copy method name'}
						className="cursor-pointer press-down text-tertiary hover:text-primary h-full py-[10px] px-[4px] focus-visible:-outline-offset-2!"
					>
						{copyNotifying ? (
							<CheckIcon className="w-[12px] h-[12px]" />
						) : (
							<CopyIcon className="w-[12px] h-[12px]" />
						)}
					</button>
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation()
							void handleCopyPermalink()
						}}
						title={linkNotifying ? 'Copied!' : 'Copy permalink'}
						className="cursor-pointer press-down text-tertiary hover:text-primary h-full py-[10px] px-[4px] focus-visible:-outline-offset-2!"
					>
						{linkNotifying ? (
							<CheckIcon className="w-[12px] h-[12px]" />
						) : (
							<LinkIcon className="w-[12px] h-[12px]" />
						)}
					</button>
					<button
						type="button"
						onClick={() => void refetch()}
						title="Refresh"
						disabled={isFetching || !allInputsFilled}
						className={cx(
							'text-accent cursor-pointer press-down h-full py-[10px] px-[4px] focus-visible:-outline-offset-2!',
							(isFetching || !allInputsFilled) &&
								'opacity-50 cursor-not-allowed',
						)}
					>
						<PlayIcon className="size-[14px]" />
					</button>
					<button
						type="button"
						onClick={() => setIsExpanded(!isExpanded)}
						className="text-secondary cursor-pointer press-down h-full py-[10px] pl-[4px] pr-[12px] focus-visible:-outline-offset-2!"
					>
						<ChevronDownIcon
							className={cx('w-[14px] h-[14px]', isExpanded && 'rotate-180')}
						/>
					</button>
				</div>
			</div>

			{isExpanded && (
				<div className="border-t border-card-border px-[12px] py-[10px] flex flex-col gap-[10px]">
					{fn.inputs.map((input, index) => {
						const key = input.name ?? `arg${index}`
						return (
							<FunctionInput
								key={key}
								input={input}
								value={inputs[key] ?? ''}
								onChange={(value) => handleInputChange(key, value)}
							/>
						)
					})}

					{isFetching && (
						<div className="flex">
							<ReturnIcon className="shrink-0 size-[12px] text-tertiary mr-[6px] mt-[4px]" />
							<p className="text-[13px] text-secondary leading-[20px]">
								{ellipsis}
							</p>
						</div>
					)}

					{!isFetching && (result !== undefined || error) && (
						<div className="flex">
							<ReturnIcon className="shrink-0 size-[12px] text-tertiary mr-[6px] mt-[4px]" />
							<p
								className={cx(
									'text-[13px] break-all leading-[20px]',
									error ? 'text-red-400' : 'text-primary',
								)}
							>
								{error ?? formatOutputValue(result, outputType)}
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

function FunctionInput(props: {
	input: { name?: string; type: string }
	value: string
	onChange: (value: string) => void
}) {
	const { input, value, onChange } = props

	const inputId = React.useId()
	const placeholder = getPlaceholder(input)
	const inputType = getInputType(input.type)

	// Special handling for bool type
	if (inputType === 'checkbox') {
		return (
			<div className="flex items-center gap-[8px]">
				<input
					autoCorrect="off"
					autoComplete="off"
					spellCheck={false}
					autoCapitalize="off"
					id={inputId}
					type="checkbox"
					checked={value === 'true'}
					className="w-[16px] h-[16px] rounded border-base-border"
					onChange={(event) =>
						onChange(event.target.checked ? 'true' : 'false')
					}
				/>
				<label htmlFor={inputId} className="text-[12px] text-primary font-mono">
					{input.name || 'value'}{' '}
					<span className="text-secondary">({input.type})</span>
				</label>
			</div>
		)
	}

	// Textarea for complex types
	if (inputType === 'textarea' || isArrayType(input.type)) {
		return (
			<div className="flex flex-col gap-[4px]">
				<label htmlFor={inputId} className="text-[12px] text-primary font-mono">
					{input.name || 'value'}{' '}
					<span className="text-secondary">({input.type})</span>
				</label>
				<textarea
					rows={3}
					id={inputId}
					placeholder={placeholder}
					onChange={(event) => onChange(event.target.value)}
					className="w-full rounded-[6px] border border-base-border bg-alt px-[10px] py-[6px] text-[13px] text-primary placeholder:text-secondary focus-visible:outline-1 focus-visible:outline-accent resize-none font-mono"
				/>
			</div>
		)
	}

	// Standard text input
	return (
		<div className="flex flex-col gap-[4px]">
			<label htmlFor={inputId} className="text-[12px] text-primary font-mono">
				{input.name || 'value'}{' '}
				<span className="text-secondary">({input.type})</span>
			</label>
			<input
				autoCorrect="off"
				autoComplete="off"
				spellCheck={false}
				autoCapitalize="off"
				type="text"
				id={inputId}
				placeholder={placeholder}
				onChange={(event) => onChange(event.target.value)}
				className="w-full rounded-[6px] border border-base-border bg-alt px-[10px] py-[6px] text-[13px] text-primary placeholder:text-secondary focus-visible:outline-1 focus-visible:outline-accent font-mono"
			/>
		</div>
	)
}
