import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Alert, StatusIndicator, Tooltip, style } from '@tempoxyz/ds/platform'
import { Play } from '@tempoxyz/ds/platform/icons'
import type { Address } from 'ox'
import * as React from 'react'
import type { Abi, Hex } from 'viem'
import { encodeFunctionData } from 'viem'
import { useConnection, useWriteContract } from 'wagmi'
import { cx } from 'zyzz'
import {
	FunctionAction,
	FunctionCard,
	FunctionInput,
	functionInputKey,
} from '#comps/ContractFunction'
import {
	getFunctionSelector,
	getWriteFunctions,
	parseInputValue,
	type WriteFunction,
} from '#lib/domain/contracts'
import { usePermalinkHighlight } from '#lib/hooks'
import { link, linkHover, pressDown, transitionColors } from '#styles/explorer'
import FlaskIcon from '~icons/lucide/flask-conical'

function getWriteErrorMessage(err: Error): string {
	// Walk the cause chain to find the deepest shortMessage/message
	let deepest = err as Error & { shortMessage?: string }
	let current: unknown = err
	while (
		current &&
		typeof current === 'object' &&
		'cause' in current &&
		current.cause instanceof Error
	) {
		current = current.cause
		deepest = current as Error & { shortMessage?: string }
	}

	const message =
		(err as Error & { shortMessage?: string }).shortMessage ??
		deepest.shortMessage ??
		deepest.message ??
		err.message ??
		'Transaction failed'

	if (/unknown reason|reverted/i.test(message)) {
		return `${message}. This usually means the caller is not authorized (e.g. only the contract owner/admin can execute this function).`
	}

	return message
}

export function ContractWriter(props: ContractWriter.Props) {
	const { address, abi } = props

	const key = React.useId()

	const writeFunctions = getWriteFunctions(abi)

	return (
		<div {...styles.list()}>
			{writeFunctions.map((fn) => (
				<WriteContractFunction
					key={`${fn.name}-${key}-${fn.inputs?.length}`}
					address={address}
					abi={abi}
					fn={fn}
				/>
			))}

			{writeFunctions.length === 0 && (
				<p {...styles.emptyMessage()}>No write functions available.</p>
			)}
		</div>
	)
}

export declare namespace ContractWriter {
	interface Props {
		address: Address.Address
		abi: Abi
	}
}

function WriteContractFunction(props: {
	address: Address.Address
	abi: Abi
	fn: WriteFunction
}) {
	const { fn } = props
	const [inputs, setInputs] = React.useState<Record<string, string>>({})

	const selector = getFunctionSelector(fn)
	const fnId = `write-${fn.name || selector}`

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
		if (!allInputsFilled) return { args: [], error: null }
		try {
			const args = (fn.inputs ?? []).map((input, index) =>
				parseInputValue(
					inputs[functionInputKey(input, index)] ?? '',
					input.type,
				),
			)
			return { args, error: null }
		} catch (error) {
			return {
				args: [],
				error:
					error instanceof Error ? error.message : 'Failed to parse inputs',
			}
		}
	}, [fn.inputs, inputs, allInputsFilled])

	/**
	 * Calldata for the Simulate link. Falls back to the bare selector when the
	 * arguments aren't filled in yet, so the link is never dead.
	 */
	const simulateCalldata = React.useMemo(() => {
		if (allInputsFilled && !parsedArgs.error)
			try {
				return encodeFunctionData({
					abi: props.abi,
					functionName: fn.name,
					args: parsedArgs.args,
				})
			} catch {
				// Fall through to the selector.
			}
		return selector as Hex
	}, [allInputsFilled, parsedArgs, props.abi, fn.name, selector])

	const isPayable = fn.stateMutability === 'payable'
	const hasInputs = fn.inputs.length > 0 || isPayable

	const connection = useConnection()
	const queryClient = useQueryClient()

	const writeContract = useWriteContract({
		mutation: {
			onSuccess: () =>
				queryClient
					.invalidateQueries({ queryKey: ['readContract'] })
					.then(() =>
						queryClient.refetchQueries({ queryKey: ['readContract'] }),
					),
		},
	})

	return (
		<FunctionCard
			id={fnId}
			fn={fn}
			expanded={isExpanded}
			onToggle={hasInputs ? () => setIsExpanded(!isExpanded) : undefined}
			tag={
				isPayable && <StatusIndicator tone="warning">payable</StatusIndicator>
			}
			actions={
				<>
					{/* Simulate is available whether or not a wallet is connected —
					    checking what a write would do is the step *before* signing, and
					    gating it on a connection put the safe option behind the risky
					    one. Args are optional: an unfilled form still simulates the
					    selector, which is enough to see who is allowed to call it. */}
					<Tooltip content="Simulate this call without signing">
						<Link
							to="/simulate"
							search={{
								to: props.address,
								data: simulateCalldata,
								...(connection.address ? { from: connection.address } : {}),
								...(isPayable && inputs.value ? { value: inputs.value } : {}),
							}}
							aria-label="Simulate this call without signing"
							{...cx(styles.simulate(), pressDown(), transitionColors())}
						>
							<FlaskIcon {...styles.simulateIcon()} />
						</Link>
					</Tooltip>
					{connection.status === 'connected' && (
						<FunctionAction
							label="Execute"
							disabled={
								writeContract.isPending || (hasInputs && !allInputsFilled)
							}
							onClick={() =>
								writeContract.mutate({
									address: props.address,
									abi: props.abi,
									functionName: fn.name,
									args: parsedArgs.args,
									value: isPayable
										? inputs.value
											? BigInt(inputs.value)
											: undefined
										: undefined,
								})
							}
						>
							<Play />
						</FunctionAction>
					)}
				</>
			}
		>
			{hasInputs && isExpanded && (
				<>
					{isPayable && (
						<FunctionInput
							label="Value (wei)"
							value={inputs.value ?? ''}
							input={{ name: 'value', type: 'uint256' }}
							onChange={(value) => handleInputChange('value', value)}
						/>
					)}

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

					{parsedArgs.error && (
						<Alert
							tone="negative"
							title="Invalid arguments"
							description={parsedArgs.error}
							style={fullWidth}
						/>
					)}

					{writeContract.error && (
						<Alert
							role="alert"
							tone="negative"
							title="Transaction failed"
							description={getWriteErrorMessage(writeContract.error)}
							style={fullWidth}
						/>
					)}

					{writeContract.isSuccess && writeContract.data && (
						<Alert
							role="status"
							tone="positive"
							title="Transaction sent"
							description={
								<Link
									to="/receipt/$hash"
									params={{ hash: writeContract.data }}
									{...cx(styles.receipt(), link(), linkHover())}
								>
									{writeContract.data}
								</Link>
							}
							style={fullWidth}
						/>
					)}
				</>
			)}
		</FunctionCard>
	)
}

const fullWidth = { width: '100%' } satisfies React.CSSProperties

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

	// A small tertiary IconButton's geometry; it navigates, so it stays a
	// router link. The card clips overflow, so the ring is drawn inside.
	export const simulate = style({
		alignItems: 'center',
		borderRadius: 'full',
		color: 'content.primary',
		display: 'inline-flex',
		flexShrink: 0,
		height: '32',
		justifyContent: 'center',
		width: '32',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
		':focus-visible': { outlineOffset: '-2px' },
	})

	export const simulateIcon = style({ height: '16', width: '16' })

	export const receipt = style({
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})
}
