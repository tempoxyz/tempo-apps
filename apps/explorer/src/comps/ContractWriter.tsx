import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button, Callout, Tag, Tooltip, style } from '@tempoxyz/ds'
import { Play } from '@tempoxyz/ds/icons'
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
import { link, linkHover } from '#styles/explorer'
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
				isPayable && (
					<Tag intent="warning" variant="plain">
						<Tag.Dot />
						payable
					</Tag>
				)
			}
			actions={
				<>
					{/* Simulate is available whether or not a wallet is connected —
					    checking what a write would do is the step *before* signing, and
					    gating it on a connection put the safe option behind the risky
					    one. Args are optional: an unfilled form still simulates the
					    selector, which is enough to see who is allowed to call it. */}
					<Tooltip.Root>
						<Tooltip.Trigger
							render={
								<Button.Link
									aria-label="Simulate this call without signing"
									render={
										<Link
											to="/simulate"
											search={{
												to: props.address,
												data: simulateCalldata,
												...(connection.address
													? { from: connection.address }
													: {}),
												...(isPayable && inputs.value
													? { value: inputs.value }
													: {}),
											}}
										/>
									}
									shape="icon"
									size="small"
									variant="text"
									{...styles.simulate()}
								/>
							}
						>
							<FlaskIcon {...styles.simulateIcon()} />
						</Tooltip.Trigger>
						<Tooltip.Popup>Simulate this call without signing</Tooltip.Popup>
					</Tooltip.Root>
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
						<Callout intent="negative" role="status" size="small">
							<Callout.Icon />
							<Callout.Content>
								<strong>Invalid arguments</strong>
								<span {...styles.calloutDescription()}>{parsedArgs.error}</span>
							</Callout.Content>
						</Callout>
					)}

					{writeContract.error && (
						<Callout intent="negative" size="small">
							<Callout.Icon />
							<Callout.Content>
								<strong>Transaction failed</strong>
								<span {...styles.calloutDescription()}>
									{getWriteErrorMessage(writeContract.error)}
								</span>
							</Callout.Content>
						</Callout>
					)}

					{writeContract.isSuccess && writeContract.data && (
						<Callout intent="positive" size="small">
							<Callout.Icon />
							<Callout.Content>
								<strong>Transaction sent</strong>
								<Link
									to="/receipt/$hash"
									params={{ hash: writeContract.data }}
									{...cx(
										styles.calloutDescription(),
										styles.receipt(),
										link(),
										linkHover(),
									)}
								>
									{writeContract.data}
								</Link>
							</Callout.Content>
						</Callout>
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
		gap: '3',
	})

	export const emptyMessage = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const simulate = style({ flexShrink: 0 })

	export const simulateIcon = style({ height: '4', width: '4' })

	export const calloutDescription = style({
		display: 'block',
		overflowWrap: 'anywhere',
	})

	export const receipt = style({
		typography: 'label.12.mono',
		wordBreak: 'break-all',
	})
}
