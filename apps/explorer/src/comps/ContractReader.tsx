import { Link, useLocation } from '@tanstack/react-router'
import { Address } from 'ox'
import { getSignature } from 'ox/AbiItem'
import * as React from 'react'
import type { Abi, AbiFunction } from 'viem'
import { decodeFunctionResult, encodeFunctionData } from 'viem'
import { useCall, useReadContract } from 'wagmi'
import { cx } from '#cva.config.ts'
import { ellipsis } from '#lib/chars'
import {
	formatOutputValue,
	getContractAbi,
	getFunctionSelector,
	getInputFunctions,
	getInputType,
	getNoInputFunctions,
	getPlaceholder,
	isArrayType,
	parseInputValue,
} from '#lib/domain/contracts.ts'
import { useCopy } from '#lib/hooks.ts'
import CheckIcon from '~icons/lucide/check'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'
import DownloadIcon from '~icons/lucide/download'
import ExternalLinkIcon from '~icons/lucide/external-link'
import LinkIcon from '~icons/lucide/link'

// ============================================================================
// Types
// ============================================================================

type ReadFunction = AbiFunction & { stateMutability: 'view' | 'pure' }

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get a display-friendly function signature.
 * Uses getSignature for named functions, falls back to selector for unnamed (whatsabi).
 */
function getFunctionDisplaySignature(fn: AbiFunction): string {
	if (fn.name) return getSignature(fn)
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

// ============================================================================
// Main Component
// ============================================================================

export function ContractReader(props: {
	address: Address.Address
	abi?: Abi
	docsUrl?: string
}) {
	const { address, docsUrl } = props
	const { copy: copyAbi, notifying: copiedAbi } = useCopy({ timeout: 2000 })
	const location = useLocation()

	const abi = props.abi ?? getContractAbi(address)

	const key = React.useId()

	// Scroll to function when hash is present
	React.useEffect(() => {
		const hash = location.hash
		if (hash && typeof window !== 'undefined') {
			// Small delay to ensure DOM is rendered
			const timer = setTimeout(() => {
				// Strip the leading '#' since getElementById expects just the ID
				const element = document.getElementById(hash.slice(1))
				if (element) {
					element.scrollIntoView({ behavior: 'smooth', block: 'center' })
					// Add a brief highlight effect
					element.classList.add('ring-1', 'ring-accent', 'ring-offset-1')
					setTimeout(() => {
						element.classList.remove('ring-1', 'ring-accent', 'ring-offset-1')
					}, 2_000)
				}
			}, 100)
			return () => clearTimeout(timer)
		}
	}, [location.hash])

	const handleCopyAbi = React.useCallback(() => {
		if (!abi) return
		void copyAbi(JSON.stringify(abi, null, 2))
	}, [abi, copyAbi])

	const handleDownloadAbi = React.useCallback(() => {
		if (!abi || typeof window === 'undefined') return
		const json = JSON.stringify(abi, null, 2)
		const blob = new Blob([json], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `${address}-abi.json`
		document.body.appendChild(anchor)
		anchor.click()
		document.body.removeChild(anchor)
		URL.revokeObjectURL(url)
	}, [abi, address])

	if (!abi) {
		return (
			<div className="rounded-[10px] bg-card-header p-[18px] h-full">
				<p className="text-sm font-medium text-tertiary">
					No ABI available for this contract.
				</p>
			</div>
		)
	}

	const noInputFunctions = getNoInputFunctions(abi)
	const inputFunctions = getInputFunctions(abi)

	return (
		<div className="flex flex-col gap-[14px]">
			{/* ABI Viewer */}
			<ContractFeatureCard
				title="ABI"
				description="Shareable interface definition for read/write tooling."
				actions={
					<div className="flex gap-[8px]">
						{docsUrl && (
							<a
								href={docsUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[12px] rounded-[6px] border border-card-border px-[10px] py-[6px] hover:bg-base-alt transition-colors inline-flex items-center gap-[4px]"
							>
								Docs
								<ExternalLinkIcon className="w-[12px] h-[12px]" />
							</a>
						)}
						<button
							type="button"
							onClick={handleDownloadAbi}
							className="text-[12px] rounded-[6px] border border-card-border px-[10px] py-[6px] hover:bg-base-alt transition-colors inline-flex items-center gap-[4px]"
						>
							<DownloadIcon className="w-[12px] h-[12px]" />
							Download
						</button>
					</div>
				}
			>
				<AbiViewer abi={abi} onCopy={handleCopyAbi} copied={copiedAbi} />
			</ContractFeatureCard>

			<div aria-hidden="true" className="border-b border-card-border" />

			{/* Read Contract Panel */}
			<ContractFeatureCard
				title="Read contract"
				description="Call view methods to read contract state."
			>
				<div className="flex flex-col gap-[12px]">
					{/* Functions without inputs - show as static values */}
					{noInputFunctions.map((fn) => (
						<StaticReadFunction
							key={fn.name}
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
			</ContractFeatureCard>
		</div>
	)
}

// ============================================================================
// ABI Viewer
// ============================================================================

function AbiViewer(props: { abi: Abi; onCopy: () => void; copied: boolean }) {
	const { abi, onCopy, copied } = props

	return (
		<div className="relative">
			<div className="absolute right-[8px] top-[8px] flex items-center gap-[4px]">
				{copied && (
					<span className="text-[11px] uppercase tracking-wide text-tertiary leading-none">
						copied
					</span>
				)}
				<button
					type="button"
					onClick={onCopy}
					title={copied ? 'Copied' : 'Copy JSON'}
					className="rounded-[6px] bg-card p-[6px] text-tertiary press-down hover:text-primary transition-colors"
				>
					<CopyIcon className="h-[14px] w-[14px]" />
				</button>
			</div>
			<pre className="max-h-[280px] overflow-auto rounded-[8px] text-[12px] leading-[18px] text-primary/90 font-mono">
				{JSON.stringify(abi, null, 2)}
			</pre>
		</div>
	)
}

// ============================================================================
// Static Read Function (no inputs)
// ============================================================================

function StaticReadFunction(props: {
	address: Address.Address
	abi: Abi
	fn: ReadFunction
}) {
	const { address, abi, fn } = props
	const { copy, notifying } = useCopy({ timeout: 2_000 })
	const { copy: copyLink, notifying: linkCopied } = useCopy({ timeout: 2_000 })

	const [mounted, setMounted] = React.useState(false)
	React.useEffect(() => setMounted(true), [])

	const hasOutputs = Array.isArray(fn.outputs) && fn.outputs.length > 0

	const {
		data: typedResult,
		error: typedError,
		isLoading: typedLoading,
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
	} = useCall({
		to: address,
		data: callData,
		query: { enabled: mounted && !hasOutputs && Boolean(callData) },
	})

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

	const isResultAddress =
		typeof result === 'string' && Address.validate(result as string)
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

	const selector = getFunctionSelector(fn)
	const fnId = fn.name || selector

	const handleCopyPermalink = () => {
		const url = new URL(window.location.href)
		url.hash = fnId
		void copyLink(url.toString())
	}

	return (
		<div
			id={fnId}
			className="flex flex-col gap-[4px] rounded-[8px] border border-dashed border-card-border px-[12px] py-[10px] transition-all duration-300"
		>
			<div className="flex items-center justify-between gap-[8px]">
				<span className="text-[12px] text-secondary font-mono">
					{getFunctionDisplaySignature(fn)}
				</span>
				<div className="flex items-center gap-[8px]">
					<button
						type="button"
						onClick={handleCopyMethod}
						title={notifying ? 'Copied!' : 'Copy method name'}
						className={cx(
							'transition-colors press-down',
							notifying ? 'text-positive' : 'text-tertiary hover:text-primary',
						)}
					>
						{notifying ? (
							<CheckIcon className="w-[12px] h-[12px]" />
						) : (
							<CopyIcon className="w-[12px] h-[12px]" />
						)}
					</button>
					<button
						type="button"
						onClick={handleCopyPermalink}
						title={linkCopied ? 'Copied!' : 'Copy permalink'}
						className={cx(
							'transition-colors press-down',
							linkCopied ? 'text-positive' : 'text-tertiary hover:text-primary',
						)}
					>
						{linkCopied ? (
							<CheckIcon className="w-[12px] h-[12px]" />
						) : (
							<LinkIcon className="w-[12px] h-[12px]" />
						)}
					</button>
				</div>
			</div>
			{isValidAddress ? (
				<Link
					to="/address/$address"
					params={{ address: result as Address.Address }}
					className="text-[13px] text-accent hover:text-accent/80 transition-colors font-mono"
				>
					{displayValue}
				</Link>
			) : (
				<span
					className={cx(
						'text-[13px] font-mono',
						error ? 'text-red-400' : 'text-primary',
					)}
				>
					{displayValue}
				</span>
			)}
		</div>
	)
}

// ============================================================================
// Dynamic Read Function (with inputs)
// ============================================================================

function DynamicReadFunction(props: {
	address: Address.Address
	abi: Abi
	fn: ReadFunction
}) {
	const { address, abi, fn } = props
	const [isExpanded, setIsExpanded] = React.useState(false)
	const [inputs, setInputs] = React.useState<Record<string, string>>({})
	const { copy, notifying } = useCopy({ timeout: 2_000 })
	const { copy: copyLink, notifying: linkCopied } = useCopy({ timeout: 2_000 })

	const selector = getFunctionSelector(fn)
	const fnId = fn.name || selector

	const handleInputChange = (name: string, value: string) => {
		setInputs((prev) => ({ ...prev, [name]: value }))
	}

	const allInputsFilled = (fn.inputs ?? []).every((input) => {
		const value = inputs[input.name ?? '']
		return value !== undefined && value.trim() !== ''
	})

	const parsedArgs = React.useMemo(() => {
		if (!allInputsFilled) return { args: [] as Array<unknown>, error: null }
		try {
			const args = (fn.inputs ?? []).map((input) => {
				const value = inputs[input.name ?? ''] ?? ''
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

	const {
		data: result,
		error: queryError,
		isLoading,
	} = useReadContract({
		address,
		abi,
		functionName: fnId,
		args: parsedArgs.args,
		query: {
			enabled: allInputsFilled && !parsedArgs.error,
		},
	})

	const error =
		parsedArgs.error ?? (queryError ? queryError.message : null) ?? null

	const outputType = fn.outputs?.[0]?.type ?? 'unknown'

	const handleCopyMethod = (e: React.MouseEvent) => {
		e.stopPropagation()
		void copy(getMethodWithSelector(fn))
	}

	const handleCopyPermalink = (e: React.MouseEvent) => {
		e.stopPropagation()
		const url = new URL(window.location.href)
		url.hash = fnId
		void copyLink(url.toString())
	}

	return (
		<div
			id={fnId}
			className="rounded-[8px] border border-dashed border-card-border overflow-hidden transition-all duration-300"
		>
			<div className="w-full flex items-center justify-between px-[12px] py-[10px] hover:bg-card-header/50 transition-colors">
				<button
					type="button"
					onClick={() => setIsExpanded(!isExpanded)}
					className="flex-1 text-left"
				>
					<span className="text-[12px] text-secondary font-mono">
						{getFunctionDisplaySignature(fn)}
					</span>
				</button>
				<div className="flex items-center gap-[8px]">
					<button
						type="button"
						onClick={handleCopyMethod}
						title={notifying ? 'Copied!' : 'Copy method name'}
						className={cx(
							'transition-colors press-down',
							notifying ? 'text-positive' : 'text-tertiary hover:text-primary',
						)}
					>
						{notifying ? (
							<CheckIcon className="w-[12px] h-[12px]" />
						) : (
							<CopyIcon className="w-[12px] h-[12px]" />
						)}
					</button>
					<button
						type="button"
						onClick={handleCopyPermalink}
						title={linkCopied ? 'Copied!' : 'Copy permalink'}
						className={cx(
							'transition-colors press-down',
							linkCopied ? 'text-positive' : 'text-tertiary hover:text-primary',
						)}
					>
						{linkCopied ? (
							<CheckIcon className="w-[12px] h-[12px]" />
						) : (
							<LinkIcon className="w-[12px] h-[12px]" />
						)}
					</button>
					<button
						type="button"
						onClick={() => setIsExpanded(!isExpanded)}
						className="text-secondary"
					>
						<ChevronDownIcon
							className={cx(
								'w-[14px] h-[14px] transition-transform',
								isExpanded && 'rotate-180',
							)}
						/>
					</button>
				</div>
			</div>

			{isExpanded && (
				<div className="border-t border-card-border px-[12px] py-[10px] flex flex-col gap-[10px]">
					{fn.inputs.map((input, index) => (
						<FunctionInput
							key={input.name ?? index}
							input={input}
							value={inputs[input.name ?? ''] ?? ''}
							onChange={(value) =>
								handleInputChange(input.name ?? `arg${index}`, value)
							}
						/>
					))}

					{isLoading && (
						<p className="text-[12px] text-secondary">{ellipsis}</p>
					)}

					{!isLoading && (result !== undefined || error) && (
						<div className="p-2.5 rounded-md bg-card-header flex flex-col gap-2">
							<span className="text-[11px] text-secondary uppercase tracking-wide font-medium">
								Result
							</span>
							<p
								className={cx(
									'text-[13px] mt-[4px] break-all font-mono',
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

// ============================================================================
// Function Input Component
// ============================================================================

function FunctionInput(props: {
	input: { name?: string; type: string }
	value: string
	onChange: (value: string) => void
}) {
	const { input, value, onChange } = props
	const inputId = React.useId()
	const inputType = getInputType(input.type)
	const placeholder = getPlaceholder(input as { name: string; type: string })

	// Special handling for bool type
	if (inputType === 'checkbox') {
		return (
			<div className="flex items-center gap-[8px]">
				<input
					id={inputId}
					type="checkbox"
					checked={value === 'true'}
					onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
					className="w-[16px] h-[16px] rounded border-base-border"
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
					id={inputId}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					rows={3}
					className="w-full rounded-[6px] border border-base-border bg-card px-[10px] py-[6px] text-[13px] text-primary placeholder:text-secondary focus-visible:outline-1 focus-visible:outline-accent resize-none font-mono"
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
				id={inputId}
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="w-full rounded-[6px] border border-base-border bg-card px-[10px] py-[6px] text-[13px] text-primary placeholder:text-secondary focus-visible:outline-1 focus-visible:outline-accent font-mono"
			/>
		</div>
	)
}

// ============================================================================
// Shared Components
// ============================================================================

function ContractFeatureCard(props: {
	title: string
	description?: React.ReactNode
	actions?: React.ReactNode
	children: React.ReactNode
}) {
	const { title, description, actions, children } = props
	return (
		<section className="rounded-[10px] bg-card-header overflow-hidden">
			<div className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="text-[13px] uppercase text-primary font-medium">
						{title}
					</p>
					{description && (
						<p className="text-[12px] text-secondary">{description}</p>
					)}
				</div>
				{actions}
			</div>
			<div className="border-t border-card-border bg-card px-4 py-3.5">
				{children}
			</div>
		</section>
	)
}

export { ContractFeatureCard }
