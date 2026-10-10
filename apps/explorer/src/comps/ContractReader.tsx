import { Link } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { getSignature } from 'ox/AbiItem'
import { IconButton, style, variants } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { decodeFunctionResult, encodeFunctionData } from 'viem'
import type { Abi, AbiFunction } from 'viem'
import { useCall, useReadContract } from 'wagmi'
import { cx } from 'zyzz'
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
import { link, linkHover, pressDown, transitionColors } from '#styles/explorer'
import CheckIcon from '~icons/lucide/check'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'
import ReturnIcon from '~icons/lucide/corner-down-right'
import LinkIcon from '~icons/lucide/link'
import PlayIcon from '~icons/lucide/play'

type ReadFunction = AbiFunction & { stateMutability: 'view' | 'pure' }

/**
 * Try to decode raw hex call result using type heuristics.
 * Used for whatsabi-extracted ABIs where output types are unknown.
 */
function decodeRawCallResult(
	fn: ReadFunction,
	data: `0x${string}`,
): unknown | undefined {
	const fnName = fn.name || getFunctionSelector(fn)

	// Check if it looks like a padded address (32 bytes with 12 leading zero bytes)
	// Also exclude small values (first 8 bytes of address = 0) which are almost
	// certainly uint256, not addresses (e.g., decimals() returning 6)
	const looksLikeAddress =
		data.length === 66 &&
		data.slice(2, 26) === '000000000000000000000000' &&
		data.slice(26) !== '0000000000000000000000000000000000000000' &&
		data.slice(26, 42) !== '0000000000000000'

	if (looksLikeAddress) {
		try {
			const addressAbi = [
				{ ...fn, name: fnName, outputs: [{ type: 'address', name: '' }] },
			]
			return decodeFunctionResult({
				abi: addressAbi,
				functionName: fnName,
				data,
			})
		} catch {
			// Fall through to other attempts
		}
	}

	// Check if it looks like a dynamic array (address[], uint256[], bytes32[], etc.)
	// Format: offset (32 bytes) + length (32 bytes) + N elements (32 bytes each)
	if (data.length >= 130) {
		try {
			const offset = Number.parseInt(data.slice(2, 66), 16)
			const length = Number.parseInt(data.slice(66, 130), 16)
			if (offset === 32 && length >= 0 && length < 100) {
				const expectedLength = 2 + 64 + 64 + length * 64
				if (data.length === expectedLength) {
					// Empty array
					if (length === 0) {
						const addressArrayAbi = [
							{
								...fn,
								name: fnName,
								outputs: [{ type: 'address[]', name: '' }],
							},
						]
						return decodeFunctionResult({
							abi: addressArrayAbi,
							functionName: fnName,
							data,
						})
					}
					// Check if elements look like addresses (12 leading zero bytes)
					let allAddressesValid = true
					for (let i = 0; i < length; i++) {
						const start = 2 + 128 + i * 64
						if (data.slice(start, start + 24) !== '000000000000000000000000') {
							allAddressesValid = false
							break
						}
					}
					if (allAddressesValid) {
						const addressArrayAbi = [
							{
								...fn,
								name: fnName,
								outputs: [{ type: 'address[]', name: '' }],
							},
						]
						return decodeFunctionResult({
							abi: addressArrayAbi,
							functionName: fnName,
							data,
						})
					}
					// Not addresses — try as uint256[]
					try {
						const uint256ArrayAbi = [
							{
								...fn,
								name: fnName,
								outputs: [{ type: 'uint256[]', name: '' }],
							},
						]
						return decodeFunctionResult({
							abi: uint256ArrayAbi,
							functionName: fnName,
							data,
						})
					} catch {
						// Fall through
					}
				}
			}
		} catch {
			// Fall through to other attempts
		}
	}

	// Try decoding as string (common for functions like typeAndVersion)
	try {
		const stringAbi = [
			{ ...fn, name: fnName, outputs: [{ type: 'string', name: '' }] },
		]
		const decoded = decodeFunctionResult({
			abi: stringAbi,
			functionName: fnName,
			data,
		}) as unknown
		// Only accept if it decoded to a non-empty, printable string
		if (
			typeof decoded === 'string' &&
			decoded.length > 0 &&
			/^[\x20-\x7e\s]+$/.test(decoded)
		) {
			return decoded
		}
	} catch {
		// Fall through
	}

	// Try decoding as uint256 (common for numeric getters)
	try {
		const uint256Abi = [
			{ ...fn, name: fnName, outputs: [{ type: 'uint256', name: '' }] },
		]
		return decodeFunctionResult({
			abi: uint256Abi,
			functionName: fnName,
			data,
		})
	} catch {
		// Return raw hex if all decode attempts fail
		return data
	}
}

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
		<div {...styles.list()}>
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
				<p {...styles.emptyMessage()}>No read functions available.</p>
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

function ReadResult(props: { error: boolean; value: string }) {
	const { error, value } = props

	return <div {...styles.readResult({ error })}>{value}</div>
}

function StaticReadFunction(props: {
	address: Address.Address
	abi: Abi
	fn: ReadFunction
}) {
	const { address, abi, fn } = props
	const { copy, notifying: copyNotifying } = useCopy({ timeout: 2_000 })

	const [mounted, setMounted] = React.useState(false)
	React.useEffect(() => setMounted(true), [])

	const selector = getFunctionSelector(fn)
	const fnId = fn.name || selector
	usePermalinkHighlight({ elementId: fnId })

	const hasOutputs = Array.isArray(fn.outputs) && fn.outputs.length > 0

	// For unnamed functions (selector-only), create an ABI with the selector as name
	// so viem can look up the function entry
	const effectiveAbi = React.useMemo(
		() => (fn.name ? abi : [{ ...fn, name: fnId }]),
		[abi, fn, fnId],
	)

	const {
		data: typedResult,
		error: typedError,
		isLoading: typedLoading,
		isFetching: typedFetching,
		refetch: typedRefetch,
	} = useReadContract({
		address,
		abi: effectiveAbi,
		functionName: fnId,
		args: [],
		query: { enabled: mounted && hasOutputs },
	})

	// Raw call fallback for functions without outputs
	const callData = React.useMemo(() => {
		if (hasOutputs) return undefined
		try {
			return encodeFunctionData({
				abi: effectiveAbi,
				functionName: fnId,
				args: [],
			})
		} catch {
			return undefined
		}
	}, [effectiveAbi, fnId, hasOutputs])

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
		return decodeRawCallResult(fn, rawResult.data)
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
		<div id={fnId} {...cx(styles.card(), styles.staticCard())}>
			<div {...styles.staticHeader()}>
				<span {...styles.staticSignature()}>
					{getFunctionDisplaySignature(fn)}
				</span>
				<div {...styles.actions()}>
					<IconButton
						aria-label={copyNotifying ? 'Copied!' : 'Copy method name'}
						onClick={handleCopyMethod}
						scale="small"
						title={copyNotifying ? 'Copied!' : 'Copy method name'}
						variant="tertiary"
						{...cx(styles.iconButton(), pressDown(), transitionColors())}
					>
						{copyNotifying ? <CheckIcon /> : <CopyIcon />}
					</IconButton>
					<IconButton
						aria-label={linkNotifying ? 'Copied!' : 'Copy permalink'}
						onClick={(event) => {
							event.stopPropagation()
							void handleCopyPermalink()
						}}
						scale="small"
						title={linkNotifying ? 'Copied!' : 'Copy permalink'}
						variant="tertiary"
						{...cx(styles.iconButton(), pressDown(), transitionColors())}
					>
						{linkNotifying ? <CheckIcon /> : <LinkIcon />}
					</IconButton>
					<IconButton
						aria-label="Refresh"
						onClick={() => void refetch()}
						scale="small"
						title="Refresh"
						disabled={isFetching}
						variant="tertiary"
						{...cx(styles.iconButton(), pressDown(), transitionColors())}
					>
						<PlayIcon />
					</IconButton>
				</div>
			</div>
			<div {...styles.staticResult()}>
				<ReturnIcon {...styles.returnIcon()} />
				{isFetching || isLoading ? (
					<div {...styles.pending()}>{ellipsis}</div>
				) : isValidAddress ? (
					<div {...styles.addressResult()}>
						<Link
							to="/address/$address"
							params={{ address: result as Address.Address }}
							{...cx(link(), linkHover())}
						>
							{displayValue}
						</Link>
					</div>
				) : (
					<ReadResult error={Boolean(error)} value={displayValue} />
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

	const effectiveAbi = React.useMemo(
		() => (fn.name ? abi : [{ ...fn, name: fnId }]),
		[abi, fn, fnId],
	)

	const {
		data: typedResult,
		error: typedError,
		isFetching: typedFetching,
		refetch: typedRefetch,
	} = useReadContract({
		address,
		abi: effectiveAbi,
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
				abi: effectiveAbi,
				functionName: fnId,
				args: parsedArgs.args,
			})
		} catch {
			return undefined
		}
	}, [effectiveAbi, fnId, hasOutputs, allInputsFilled, parsedArgs])

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
		return decodeRawCallResult(fn, rawResult.data)
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
		<div id={fnId} {...styles.card()}>
			<div {...styles.header()}>
				<button
					type="button"
					aria-label={isExpanded ? 'Collapse function' : 'Expand function'}
					aria-expanded={isExpanded}
					onClick={() => setIsExpanded(!isExpanded)}
					{...cx(styles.expandButton(), pressDown())}
				>
					<span {...styles.signature()}>{getFunctionDisplaySignature(fn)}</span>
				</button>
				<div {...styles.actions()}>
					<IconButton
						aria-label={copyNotifying ? 'Copied!' : 'Copy method name'}
						onClick={handleCopyMethod}
						scale="small"
						title={copyNotifying ? 'Copied!' : 'Copy method name'}
						variant="tertiary"
						{...cx(styles.iconButton(), pressDown(), transitionColors())}
					>
						{copyNotifying ? <CheckIcon /> : <CopyIcon />}
					</IconButton>
					<IconButton
						aria-label={linkNotifying ? 'Copied!' : 'Copy permalink'}
						onClick={(event) => {
							event.stopPropagation()
							void handleCopyPermalink()
						}}
						scale="small"
						title={linkNotifying ? 'Copied!' : 'Copy permalink'}
						variant="tertiary"
						{...cx(styles.iconButton(), pressDown(), transitionColors())}
					>
						{linkNotifying ? <CheckIcon /> : <LinkIcon />}
					</IconButton>
					<IconButton
						aria-label="Refresh"
						onClick={() => void refetch()}
						scale="small"
						title="Refresh"
						disabled={isFetching || !allInputsFilled}
						variant="tertiary"
						{...cx(styles.iconButton(), pressDown(), transitionColors())}
					>
						<PlayIcon />
					</IconButton>
					<IconButton
						aria-label={isExpanded ? 'Collapse function' : 'Expand function'}
						aria-expanded={isExpanded}
						onClick={() => setIsExpanded(!isExpanded)}
						scale="small"
						variant="tertiary"
						{...cx(styles.iconButton(), pressDown(), transitionColors())}
					>
						<ChevronDownIcon
							{...cx(styles.chevron(), isExpanded && styles.chevronExpanded())}
						/>
					</IconButton>
				</div>
			</div>

			{isExpanded && (
				<div {...styles.body()}>
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
						<div {...styles.resultRow()}>
							<ReturnIcon {...styles.returnIcon()} />
							<p {...styles.pending()}>{ellipsis}</p>
						</div>
					)}

					{!isFetching && (result !== undefined || error) && (
						<div {...styles.resultRow()}>
							<ReturnIcon {...styles.returnIcon()} />
							{error ? (
								<p {...styles.error()}>{error}</p>
							) : (
								<pre {...styles.output()}>
									{formatOutputValue(result, outputType)}
								</pre>
							)}
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
			<div {...styles.checkboxField()}>
				<input
					autoCorrect="off"
					autoComplete="off"
					spellCheck={false}
					autoCapitalize="off"
					id={inputId}
					type="checkbox"
					checked={value === 'true'}
					{...styles.checkbox()}
					onChange={(event) =>
						onChange(event.target.checked ? 'true' : 'false')
					}
				/>
				<label htmlFor={inputId} {...styles.label()}>
					{input.name || 'value'}{' '}
					<span {...styles.labelType()}>({input.type})</span>
				</label>
			</div>
		)
	}

	// Textarea for complex types
	if (inputType === 'textarea' || isArrayType(input.type)) {
		return (
			<div {...styles.field()}>
				<label htmlFor={inputId} {...styles.label()}>
					{input.name || 'value'}{' '}
					<span {...styles.labelType()}>({input.type})</span>
				</label>
				<textarea
					rows={3}
					id={inputId}
					placeholder={placeholder}
					onChange={(event) => onChange(event.target.value)}
					{...cx(styles.input(), styles.textarea())}
				/>
			</div>
		)
	}

	// Standard text input
	return (
		<div {...styles.field()}>
			<label htmlFor={inputId} {...styles.label()}>
				{input.name || 'value'}{' '}
				<span {...styles.labelType()}>({input.type})</span>
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
				{...styles.input()}
			/>
		</div>
	)
}

namespace styles {
	export const list = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
	})

	export const emptyMessage = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})

	export const readResult = variants({
		base: {
			color: 'content.primary',
			flex: 1,
			minWidth: '0px !custom',
			overflowX: 'auto',
			typography: 'mono.inline',
			whiteSpace: 'pre',
		},
		defaultVariants: { error: false },
		variants: {
			error: { true: { color: 'content.negative' }, false: {} },
		},
	})

	export const card = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderWidth: 'regular',
		overflow: 'hidden',
	})

	export const staticCard = style({ display: 'flex', flexDirection: 'column' })

	export const staticHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
	})

	export const staticSignature = style({
		color: 'content.secondary',
		flex: 1,
		minWidth: '0px !custom',
		overflowWrap: 'anywhere',
		paddingBlock: '8',
		paddingLeft: '12',
		typography: 'mono.inline',
	})

	export const actions = style({
		alignItems: 'center',
		display: 'flex',
		flexShrink: 0,
		paddingLeft: '12',
		paddingRight: '4',
	})

	// TDS IconButton owns size, color, radius, and focus ring. The card clips
	// overflow, so the ring is drawn inside the button, as before.
	export const iconButton = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
		':focus-visible': { outlineOffset: '-2px !important' },
		':disabled': { opacity: 0.5 },
	})

	export const staticResult = style({
		borderColor: 'line.secondary',
		borderTopWidth: 'regular',
		display: 'flex',
		paddingBlock: '12',
		paddingInline: '12',
	})

	export const returnIcon = style({
		color: 'content.tertiary',
		flexShrink: 0,
		height: '12',
		marginRight: '8',
		marginTop: '2',
		width: '12',
	})

	export const pending = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const addressResult = style({
		minWidth: '0px !custom',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const header = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
		width: '100% !custom',
	})

	export const expandButton = style({
		cursor: 'pointer',
		flex: 1,
		height: '100% !custom',
		minWidth: '0px !custom',
		paddingBlock: '8',
		paddingLeft: '12',
		textAlign: 'left',
		':focus-visible': {
			borderBottomLeftRadius: 'xs !important',
			borderTopLeftRadius: 'xs !important',
			outlineOffset: '-2px !important',
		},
	})

	export const signature = style({
		color: 'content.secondary',
		display: 'block',
		overflowWrap: 'anywhere',
		typography: 'mono.inline',
	})

	export const chevron = style({ flexShrink: 0 })

	export const chevronExpanded = style({ rotate: '180deg' })

	export const body = style({
		borderColor: 'line.secondary',
		borderTopWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingBlock: '12',
		paddingInline: '12',
	})

	export const resultRow = style({ display: 'flex' })

	export const error = style({
		color: 'content.negative',
		typography: 'body.b3',
		wordBreak: 'break-all',
	})

	export const output = style({
		color: 'content.primary',
		flex: 1,
		minWidth: '0px !custom',
		overflowX: 'auto',
		typography: 'mono.inline',
		whiteSpace: 'pre',
	})

	export const checkboxField = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const checkbox = style({
		accentColor: 'content.primary',
		height: '16',
		width: '16',
		// The document focus ring rounds focused controls to 8px.
		':focus-visible': { borderRadius: '3xs' },
	})

	export const label = style({
		color: 'content.primary',
		typography: 'body.b3',
	})

	export const labelType = style({ color: 'content.secondary' })

	export const field = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
	})

	// Mirrors TDS TextInput (filled, borderless) at a compact height. Focus
	// rings come from the document focus style.
	export const input = style({
		backgroundColor: 'component.input.primary.fill',
		borderRadius: '2xs',
		color: 'content.primary',
		paddingBlock: '8',
		paddingInline: '12',
		typography: 'mono.inline',
		width: '100% !custom',
		'::placeholder': { color: 'content.tertiary' },
	})

	export const textarea = style({ resize: 'none' })
}
