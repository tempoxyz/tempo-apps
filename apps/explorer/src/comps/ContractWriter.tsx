import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button, Callout, Empty, Rows, style, Tag, Tooltip } from '@tempoxyz/ds'
import { Play } from '@tempoxyz/ds/icons'
import type { Address } from 'ox'
import * as React from 'react'
import type { Abi, Hex } from 'viem'
import { encodeFunctionData } from 'viem'
import { useConnection, useWriteContract } from 'wagmi'
import {
	FunctionDisclosure,
	FunctionForm,
	FunctionInput,
	FunctionRow,
	IconAction,
	functionInputKey,
} from '#comps/ContractFunction'
import { TransactionCell } from '#comps/TransactionCell'
import {
	getFunctionSelector,
	getWriteFunctions,
	parseInputValue,
	type WriteFunction,
} from '#lib/domain/contracts'
import { usePermalinkHighlight } from '#lib/hooks'
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

	if (writeFunctions.length === 0)
		return (
			<Empty.Root>
				<Empty.Title>No write functions</Empty.Title>
				<Empty.Description>
					This ABI has no functions that change state.
				</Empty.Description>
			</Empty.Root>
		)

	return (
		<Rows.Root dividers="full">
			{writeFunctions.map((fn) => (
				<WriteContractFunction
					key={`${fn.name}-${key}-${fn.inputs?.length}`}
					address={address}
					abi={abi}
					fn={fn}
				/>
			))}
		</Rows.Root>
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
	const [submitted, setSubmitted] = React.useState(false)
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
	const connected = connection.status === 'connected'
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

	const execute = () =>
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

	// Simulate works without a wallet: checking what a write would do comes
	// before signing. Unfilled arguments still simulate the selector, which
	// shows who may call the function.
	const simulateLink = (
		<Link
			to="/simulate"
			search={{
				to: props.address,
				data: simulateCalldata,
				...(connection.address ? { from: connection.address } : {}),
				...(isPayable && inputs.value ? { value: inputs.value } : {}),
			}}
		/>
	)

	// Every write shows its outcome, with or without arguments.
	const writeResult = (
		<>
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
						<TransactionCell hash={writeContract.data} />
					</Callout.Content>
				</Callout>
			)}
		</>
	)

	if (!hasInputs)
		return (
			<>
				<FunctionRow
					id={fnId}
					fn={fn}
					actions={
						<>
							<Tooltip.Root>
								<Tooltip.Trigger
									render={
										<Button.Link
											aria-label="Simulate this call without signing"
											render={simulateLink}
											shape="icon"
											size="small"
											variant="text"
										/>
									}
								>
									<FlaskIcon {...styles.icon()} />
								</Tooltip.Trigger>
								<Tooltip.Popup>
									Simulate this call without signing
								</Tooltip.Popup>
							</Tooltip.Root>
							{connected && (
								<IconAction
									icon={Play}
									label="Execute"
									loading={writeContract.isPending}
									onClick={execute}
								/>
							)}
						</>
					}
				/>
				{(writeContract.error || writeContract.isSuccess) && (
					<Rows.Row spacing="none" {...styles.result()}>
						{writeResult}
					</Rows.Row>
				)}
			</>
		)

	const missing = (key: string) => submitted && !inputs[key]?.trim()

	return (
		<FunctionDisclosure
			id={fnId}
			fn={fn}
			expanded={isExpanded}
			onToggle={() => setIsExpanded(!isExpanded)}
			tag={
				isPayable && (
					<Tag intent="warning" size="small" variant="plain">
						<Tag.Dot />
						Payable
					</Tag>
				)
			}
		>
			<FunctionForm
				fn={fn}
				id={fnId}
				note={!connected && 'Connect a wallet to execute.'}
				onSubmit={() => {
					setSubmitted(true)
					if (connected && allInputsFilled && !parsedArgs.error) execute()
				}}
				secondary={
					<Button.Link
						render={simulateLink}
						size="small"
						variant={connected ? 'secondary' : 'primary'}
					>
						<FlaskIcon />
						Simulate
					</Button.Link>
				}
				primary={
					connected && (
						<Button
							loading={writeContract.isPending}
							size="small"
							type="submit"
						>
							Execute
						</Button>
					)
				}
				result={
					<>
						{parsedArgs.error && (
							<Callout intent="negative" role="status" size="small">
								<Callout.Icon />
								<Callout.Content>
									<strong>Invalid arguments</strong>
									<span {...styles.calloutDescription()}>
										{parsedArgs.error}
									</span>
								</Callout.Content>
							</Callout>
						)}

						{writeResult}
					</>
				}
			>
				{fn.inputs.map((input, index) => {
					const key = functionInputKey(input, index)
					return (
						<FunctionInput
							key={key}
							input={input}
							invalid={missing(key)}
							value={inputs[key] ?? ''}
							onChange={(value) => handleInputChange(key, value)}
						/>
					)
				})}

				{isPayable && (
					<FunctionInput
						label="Value (wei)"
						value={inputs.value ?? ''}
						input={{ name: 'value', type: 'uint256' }}
						onChange={(value) => handleInputChange('value', value)}
					/>
				)}
			</FunctionForm>
		</FunctionDisclosure>
	)
}

namespace styles {
	// A no-argument function's outcome, under its row.
	export const result = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingBlockEnd: '12',
	})

	// The flask comes from Lucide, so it takes the 16px glyph of the TDS icons.
	export const icon = style({ fontSize: '16' })

	export const calloutDescription = style({
		display: 'block',
		overflowWrap: 'anywhere',
	})
}
