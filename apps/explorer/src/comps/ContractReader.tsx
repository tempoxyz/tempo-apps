import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import {
	AlertCircle,
	ArrowCornerDownRight,
	Play,
} from '@tempoxyz/ds/platform/icons'
import * as Address from 'ox/Address'
import * as React from 'react'
import { decodeFunctionResult, encodeFunctionData } from 'viem'
import type { Abi, AbiFunction } from 'viem'
import { useCall, useReadContract } from 'wagmi'
import { cx } from 'zyzz'
import {
	FunctionAction,
	FunctionCard,
	FunctionInput,
	functionInputKey,
} from '#comps/ContractFunction'
import { ellipsis } from '#lib/chars'
import {
	formatOutputValue,
	getFunctionSelector,
	getInputFunctions,
	getNoInputFunctions,
	parseInputValue,
} from '#lib/domain/contracts'
import { usePermalinkHighlight } from '#lib/hooks'
import { link, linkHover } from '#styles/explorer'

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

export function ContractReader(props: { address: Address.Address; abi: Abi }) {
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

function ResultRow(props: {
	children: React.ReactNode
	error?: boolean | undefined
}): React.JSX.Element {
	return (
		<div {...styles.resultRow()}>
			{props.error ? (
				<AlertCircle {...cx(styles.resultIcon(), styles.errorIcon())} />
			) : (
				<ArrowCornerDownRight {...styles.resultIcon()} />
			)}
			{props.children}
		</div>
	)
}

function StaticReadFunction(props: {
	address: Address.Address
	abi: Abi
	fn: ReadFunction
}) {
	const { address, abi, fn } = props

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
	const pending = isFetching || isLoading

	const isResultAddress = typeof result === 'string' && Address.validate(result)
	const outputType =
		fn.outputs?.[0]?.type ?? (isResultAddress ? 'address' : 'string')

	// Format address outputs as links (only after mount to avoid hydration mismatch)
	const isAddressOutput = outputType === 'address' || isResultAddress
	const isValidAddress = mounted && isAddressOutput && isResultAddress

	return (
		<FunctionCard
			id={fnId}
			fn={fn}
			actions={
				<FunctionAction
					label="Refresh"
					disabled={isFetching}
					onClick={() => void refetch()}
				>
					<Play />
				</FunctionAction>
			}
		>
			<ResultRow error={!pending && Boolean(error)}>
				{pending ? (
					<span {...styles.pending()}>{ellipsis}</span>
				) : error ? (
					<p {...styles.error()}>{error}</p>
				) : isValidAddress ? (
					<Link
						to="/address/$address"
						params={{ address: result as Address.Address }}
						{...cx(styles.address(), link(), linkHover())}
					>
						{formatOutputValue(result, outputType)}
					</Link>
				) : (
					<pre {...styles.output()}>
						{formatOutputValue(result, outputType)}
					</pre>
				)}
			</ResultRow>
		</FunctionCard>
	)
}

function DynamicReadFunction(props: {
	address: Address.Address
	abi: Abi
	fn: ReadFunction
}) {
	const { address, abi, fn } = props
	const [inputs, setInputs] = React.useState<Record<string, string>>({})

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
		const value = inputs[functionInputKey(input, index)]
		return value !== undefined && value.trim() !== ''
	})

	const parsedArgs = React.useMemo(() => {
		if (!allInputsFilled) return { args: [] as Array<unknown>, error: null }
		try {
			const args = (fn.inputs ?? []).map((input, index) =>
				parseInputValue(
					inputs[functionInputKey(input, index)] ?? '',
					input.type,
				),
			)
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

	return (
		<FunctionCard
			id={fnId}
			fn={fn}
			expanded={isExpanded}
			onToggle={() => setIsExpanded(!isExpanded)}
			actions={
				<FunctionAction
					label="Refresh"
					disabled={isFetching || !allInputsFilled}
					onClick={() => void refetch()}
				>
					<Play />
				</FunctionAction>
			}
		>
			{isExpanded && (
				<>
					{fn.inputs.map((input, index) => {
						const key = functionInputKey(input, index)
						return (
							<FunctionInput
								key={key}
								input={input}
								value={inputs[key] ?? ''}
								onChange={(value) => handleInputChange(key, value)}
							/>
						)
					})}

					{isFetching ? (
						<ResultRow>
							<span {...styles.pending()}>{ellipsis}</span>
						</ResultRow>
					) : (
						(result !== undefined || error) && (
							<ResultRow error={Boolean(error)}>
								{error ? (
									<p {...styles.error()}>{error}</p>
								) : (
									<pre {...styles.output()}>
										{formatOutputValue(result, outputType)}
									</pre>
								)}
							</ResultRow>
						)
					)}
				</>
			)}
		</FunctionCard>
	)
}

namespace styles {
	export const list = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
	})

	export const emptyMessage = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const resultRow = style({ display: 'flex', gap: '8' })

	export const resultIcon = style({
		color: 'content.tertiary',
		flexShrink: 0,
		height: '12',
		marginTop: '2',
		width: '12',
	})

	export const errorIcon = style({ color: 'content.negative' })

	export const pending = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const address = style({
		minWidth: '0px !custom',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const error = style({
		color: 'content.primary',
		minWidth: '0px !custom',
		overflowWrap: 'anywhere',
		typography: 'body.b3',
		whiteSpace: 'pre-wrap',
	})

	export const output = style({
		color: 'content.primary',
		flex: 1,
		minWidth: '0px !custom',
		overflowX: 'auto',
		typography: 'mono.inline',
		whiteSpace: 'pre',
	})
}
