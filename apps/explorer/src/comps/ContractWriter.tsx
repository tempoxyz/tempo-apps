import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import { getSignature } from 'ox/AbiItem'
import { IconButton, style, variants } from '@tempoxyz/ds/platform'
import * as React from 'react'
import type { Abi, AbiFunction, Hex } from 'viem'
import { encodeFunctionData } from 'viem'
import { useConnection, useWriteContract } from 'wagmi'
import { cx } from 'zyzz'
import {
	getFunctionSelector,
	getInputType,
	getPlaceholder,
	getWriteFunctions,
	isArrayType,
	parseInputValue,
	type WriteFunction,
} from '#lib/domain/contracts'
import { useCopy, useCopyPermalink, usePermalinkHighlight } from '#lib/hooks'
import { pressDown, transitionColors } from '#styles/explorer'
import CheckIcon from '~icons/lucide/check'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'
import FlaskIcon from '~icons/lucide/flask-conical'
import LinkIcon from '~icons/lucide/link'
import PlayIcon from '~icons/lucide/play'

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

function getFunctionDisplaySignature(fn: AbiFunction): string {
	if (fn.name) return getSignature(fn).replace(/,/g, ', ')
	const selector = getFunctionSelector(fn)
	const inputs = fn.inputs?.map((i) => i.type).join(', ') ?? ''
	return `${selector}(${inputs})`
}

function getMethodWithSelector(fn: AbiFunction): string {
	const selector = getFunctionSelector(fn)
	const name = fn.name || selector
	return `${name} (${selector})`
}

function WriteContractFunction(props: {
	address: Address.Address
	abi: Abi
	fn: WriteFunction
}) {
	const { fn } = props
	const [inputs, setInputs] = React.useState<Record<string, string>>({})
	const { copy, notifying: copyNotifying } = useCopy({ timeout: 2_000 })

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

	const allInputsFilled = (fn.inputs ?? []).every((input) => {
		const value = inputs[input.name ?? '']
		return value !== undefined && value.trim() !== ''
	})

	const parsedArgs = React.useMemo(() => {
		if (!allInputsFilled) return { args: [], error: null }
		try {
			const args = (fn.inputs ?? []).map((input) => {
				const value = inputs[input.name ?? ''] ?? ''
				return parseInputValue(value, input.type)
			})
			return { args, error: null }
		} catch (error) {
			return {
				args: [],
				error:
					error instanceof Error ? error.message : 'Failed to parse inputs',
			}
		}
	}, [fn.inputs, inputs, allInputsFilled])

	const handleCopyMethod = (event: React.MouseEvent) => {
		event.stopPropagation()
		void copy(getMethodWithSelector(fn))
	}

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

	const { linkNotifying, handleCopyPermalink } = useCopyPermalink({
		fragment: fnId,
	})

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
		<div id={fnId} {...styles.card()}>
			<div {...styles.header()}>
				<button
					type="button"
					onClick={() => hasInputs && setIsExpanded(!isExpanded)}
					{...cx(
						styles.expandButton(),
						hasInputs && styles.expandable(),
						hasInputs && pressDown(),
					)}
				>
					<span {...styles.signature()}>{getFunctionDisplaySignature(fn)}</span>
					{isPayable && <span {...styles.payable()}>payable</span>}
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
					{/* Simulate is available whether or not a wallet is connected —
					    checking what a write would do is the step *before* signing, and
					    gating it on a connection put the safe option behind the risky
					    one. Args are optional: an unfilled form still simulates the
					    selector, which is enough to see who is allowed to call it. */}
					<Link
						to="/simulate"
						search={{
							to: props.address,
							data: simulateCalldata,
							...(connection.address ? { from: connection.address } : {}),
							...(isPayable && inputs.value ? { value: inputs.value } : {}),
						}}
						title="Simulate this call without signing"
						onClick={(event) => event.stopPropagation()}
						{...cx(styles.simulate(), pressDown(), transitionColors())}
					>
						<FlaskIcon {...styles.simulateIcon()} />
					</Link>
					{connection.status === 'connected' && (
						<IconButton
							aria-label="Execute"
							title="Execute"
							disabled={
								writeContract.isPending || (hasInputs && !allInputsFilled)
							}
							scale="small"
							variant="tertiary"
							{...cx(styles.iconButton(), pressDown(), transitionColors())}
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
							<PlayIcon />
						</IconButton>
					)}
					{hasInputs && (
						<IconButton
							aria-label={isExpanded ? 'Collapse function' : 'Expand function'}
							aria-expanded={isExpanded}
							onClick={() => setIsExpanded(!isExpanded)}
							scale="small"
							variant="tertiary"
							{...cx(styles.iconButton(), pressDown(), transitionColors())}
						>
							<ChevronDownIcon
								{...cx(
									styles.chevron(),
									isExpanded && styles.chevronExpanded(),
								)}
							/>
						</IconButton>
					)}
				</div>
			</div>

			{isExpanded && (
				<div {...styles.body()}>
					{isPayable && (
						<FunctionInput
							label="Value (wei)"
							value={inputs.value}
							input={{ name: 'value', type: 'uint256' }}
							onChange={(value) => handleInputChange('value', value)}
						/>
					)}

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

					{parsedArgs.error && (
						<div {...styles.message({ tone: 'negative' })}>
							<p {...styles.messageText()}>{parsedArgs.error}</p>
						</div>
					)}

					{writeContract.error && (
						<div {...styles.message({ tone: 'negative' })}>
							<p {...styles.messageText()}>
								{getWriteErrorMessage(writeContract.error)}
							</p>
						</div>
					)}

					{writeContract.isSuccess && writeContract.data && (
						<div {...styles.message({ tone: 'positive' })}>
							<p {...styles.receipt()}>
								tx:{' '}
								<Link
									to="/receipt/$hash"
									params={{ hash: writeContract.data }}
									{...styles.receiptLink()}
								>
									{writeContract.data}
								</Link>
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
	label?: string
}) {
	const { input, value, onChange, label } = props
	const inputId = React.useId()
	const inputType = getInputType(input.type)
	const placeholder = getPlaceholder(input as { name: string; type: string })

	const displayLabel = label ?? input.name ?? 'value'

	if (inputType === 'checkbox') {
		return (
			<div {...styles.checkboxField()}>
				<input
					id={inputId}
					type="checkbox"
					checked={value === 'true'}
					onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
					{...styles.checkbox()}
				/>
				<label htmlFor={inputId} {...styles.label()}>
					{displayLabel} <span {...styles.labelType()}>({input.type})</span>
				</label>
			</div>
		)
	}

	if (inputType === 'textarea' || isArrayType(input.type)) {
		return (
			<div {...styles.field()}>
				<label htmlFor={inputId} {...styles.label()}>
					{displayLabel} <span {...styles.labelType()}>({input.type})</span>
				</label>
				<textarea
					id={inputId}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					rows={3}
					{...cx(styles.input(), styles.textarea())}
				/>
			</div>
		)
	}

	return (
		<div {...styles.field()}>
			<label htmlFor={inputId} {...styles.label()}>
				{displayLabel} <span {...styles.labelType()}>({input.type})</span>
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

	export const card = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderWidth: 'regular',
		overflow: 'hidden',
	})

	export const header = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
		width: '100% !custom',
	})

	export const expandButton = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		flexWrap: 'wrap',
		gap: '8',
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

	export const expandable = style({ cursor: 'pointer' })

	export const signature = style({
		color: 'content.secondary',
		minWidth: '0px !custom',
		overflowWrap: 'anywhere',
		typography: 'mono.inline',
	})

	export const payable = style({
		backgroundColor: 'container.warning',
		borderRadius: '3xs',
		color: 'content.warning',
		flexShrink: 0,
		paddingBlock: '2',
		paddingInline: '8',
		typography: 'body.b3',
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

	// Mirrors the small tertiary TDS IconButton beside it; it navigates, so it
	// stays a router link.
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
		':focus-visible': { borderRadius: 'full', outlineOffset: '-2px' },
	})

	export const simulateIcon = style({ height: '16', width: '16' })

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

	export const message = variants({
		base: {
			borderRadius: '2xs',
			borderWidth: 'regular',
			padding: '12',
		},
		variants: {
			tone: {
				negative: {
					backgroundColor: 'container.negative',
					borderColor: 'border.negative',
				},
				positive: {
					backgroundColor: 'container.positive',
					borderColor: 'border.positive',
				},
			},
		},
	})

	export const messageText = style({
		color: 'content.negative',
		typography: 'body.b3',
	})

	export const receipt = style({
		color: 'content.positive',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const receiptLink = style({ textDecorationLine: 'underline' })

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
