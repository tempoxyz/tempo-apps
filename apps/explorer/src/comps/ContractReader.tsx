import {
	Button,
	Callout,
	Empty,
	Hex,
	Rows,
	Skeleton,
	style,
} from '@tempoxyz/ds'
import { AlertCircle, Refresh } from '@tempoxyz/ds/icons'
import * as Address from 'ox/Address'
import * as React from 'react'
import { decodeFunctionResult, encodeFunctionData } from 'viem'
import type { Abi, AbiFunction } from 'viem'
import { useCall, useReadContract } from 'wagmi'
import { Address as AddressLink } from '#comps/Address'
import {
	FunctionDisclosure,
	FunctionForm,
	FunctionInput,
	FunctionResult,
	FunctionRow,
	IconAction,
	functionInputKey,
} from '#comps/ContractFunction'
import {
	formatOutputValue,
	getFunctionSelector,
	getInputFunctions,
	getNoInputFunctions,
	parseInputValue,
} from '#lib/domain/contracts'
import { usePermalinkHighlight } from '#lib/hooks'

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

	if (noInputFunctions.length === 0 && inputFunctions.length === 0)
		return (
			<Empty.Root>
				<Empty.Title>No read functions</Empty.Title>
				<Empty.Description>
					This ABI has no view or pure functions.
				</Empty.Description>
			</Empty.Root>
		)

	return (
		<Rows.Root dividers="full">
			{/* Functions without inputs show their value in the row. */}
			{noInputFunctions.map((fn) => (
				<StaticReadFunction
					key={`${fn.name}-${fn.inputs?.length ?? 0}-${address}`}
					address={address}
					abi={abi}
					fn={fn}
				/>
			))}

			{/* Functions with inputs expand into a form. */}
			{inputFunctions.map((fn) => (
				<DynamicReadFunction
					key={`${fn.name}-${key}-${fn.inputs?.length}`}
					address={address}
					abi={abi}
					fn={fn}
				/>
			))}
		</Rows.Root>
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
	const pending = isFetching || isLoading

	const isResultAddress = typeof result === 'string' && Address.validate(result)
	const outputType =
		fn.outputs?.[0]?.type ?? (isResultAddress ? 'address' : 'string')

	return (
		<FunctionRow
			id={fnId}
			fn={fn}
			value={
				// Values render after mount, so the server and the first client render match.
				pending ? (
					<Skeleton
						aria-label={`Reading ${fnId}`}
						shape="pill"
						{...styles.skeleton()}
					/>
				) : queryError ? (
					<span title={queryError.message} {...styles.error()}>
						<AlertCircle {...styles.errorIcon()} />
						{getShortMessage(queryError)}
					</span>
				) : (
					<ReadValue value={result} type={outputType} />
				)
			}
			actions={
				<IconAction
					icon={Refresh}
					label="Refresh"
					loading={isFetching}
					onClick={() => void refetch()}
				/>
			}
		/>
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

	const [submitted, setSubmitted] = React.useState(false)

	return (
		<FunctionDisclosure
			id={fnId}
			fn={fn}
			expanded={isExpanded}
			onToggle={() => setIsExpanded(!isExpanded)}
		>
			<FunctionForm
				fn={fn}
				id={fnId}
				onSubmit={() => {
					setSubmitted(true)
					if (allInputsFilled && !parsedArgs.error) void refetch()
				}}
				primary={
					<Button loading={isFetching} size="small" type="submit">
						Query
					</Button>
				}
				result={
					!isFetching &&
					(error ? (
						<Callout intent="negative" role="status" size="small">
							<Callout.Icon />
							<Callout.Content>{error}</Callout.Content>
						</Callout>
					) : (
						result !== undefined && (
							<FunctionResult>
								<ReadValue value={result} type={outputType} />
							</FunctionResult>
						)
					))
				}
			>
				{fn.inputs.map((input, index) => {
					const key = functionInputKey(input, index)
					return (
						<FunctionInput
							key={key}
							input={input}
							invalid={submitted && !inputs[key]?.trim()}
							value={inputs[key] ?? ''}
							onChange={(value) => handleInputChange(key, value)}
						/>
					)
				})}
			</FunctionForm>
		</FunctionDisclosure>
	)
}

/**
 * A returned value in the TDS Blockchain Values style: addresses link through
 * `Address`, other long hex values show in `Hex` with a copy button.
 */
function ReadValue(props: { type: string; value: unknown }): React.JSX.Element {
	const { type, value } = props
	if (value === '') return <span {...styles.empty()}>Empty</span>
	if (typeof value === 'string' && Address.validate(value))
		return (
			<span {...styles.hex()}>
				<AddressLink address={value} align="end" />
			</span>
		)
	if (typeof value === 'string' && /^0x[0-9a-f]{41,}$/i.test(value))
		return (
			<Hex.Root value={value} {...styles.hex()}>
				<Hex.Text />
				<Hex.Copy aria-label="Copy value" />
			</Hex.Root>
		)
	return <span {...styles.text()}>{formatOutputValue(value, type)}</span>
}

/** The first line of a call error; viem errors carry it as `shortMessage`. */
function getShortMessage(error: Error): string {
	const short = (error as Error & { shortMessage?: string }).shortMessage
	return short ?? error.message.split('\n')[0] ?? error.message
}

namespace styles {
	export const skeleton = style({ height: '12', width: '5rem !custom' })

	export const error = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'inline-flex',
		gap: '4',
		minWidth: '0',
		typography: 'copy.13',
	})

	export const errorIcon = style({ color: 'red.900', flexShrink: 0 })

	export const empty = style({ color: 'gray.900' })

	// Rows guidance: cap a Hex so it ends with the other values.
	export const hex = style({
		display: 'inline-flex',
		justifyContent: 'flex-end',
		maxWidth: '12rem !custom',
		minWidth: '0',
	})

	export const text = style({
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0',
		overflowWrap: 'anywhere',
		whiteSpace: 'pre-wrap',
	})
}
