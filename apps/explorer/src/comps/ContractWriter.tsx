import { useQueryClient } from '@tanstack/react-query'

import type { Address } from 'ox'
import { getSignature } from 'ox/AbiItem'
import * as React from 'react'
import type { Abi, AbiFunction } from 'viem'
import { useConnection, useWriteContract } from 'wagmi'
import { cx } from '#lib/css'
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
import CheckIcon from '~icons/lucide/check'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'
import LinkIcon from '~icons/lucide/link'
import PlayIcon from '~icons/lucide/play'

export function ContractWriter(props: ContractWriter.Props) {
	const { address, abi } = props

	const key = React.useId()

	const writeFunctions = getWriteFunctions(abi)

	return (
		<div className="flex flex-col gap-[12px]">
			{writeFunctions.map((fn) => (
				<WriteContractFunction
					key={`${fn.name}-${key}-${fn.inputs?.length}`}
					address={address}
					abi={abi}
					fn={fn}
				/>
			))}

			{writeFunctions.length === 0 && (
				<p className="text-[13px] text-tertiary">
					No write functions available.
				</p>
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
		<div
			id={fnId}
			className="rounded-[8px] border border-card-border bg-surface overflow-hidden"
		>
			<div className="w-full flex items-center justify-between">
				<button
					type="button"
					onClick={() => hasInputs && setIsExpanded(!isExpanded)}
					className={cx(
						'flex-1 text-left flex items-center gap-[8px] h-full py-[10px] pl-[12px] focus-visible:-outline-offset-2! focus-visible:rounded-l-[8px]!',
						hasInputs && 'cursor-pointer press-down',
					)}
				>
					<span className="text-[12px] text-secondary font-mono">
						{getFunctionDisplaySignature(fn)}
					</span>
					{isPayable && (
						<span className="text-[10px] px-[6px] py-[2px] rounded-[4px] bg-amber-500/20 text-amber-500 font-medium">
							payable
						</span>
					)}
				</button>
				<div className="flex items-center pl-[12px] shrink-0">
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
						className={cx(
							'cursor-pointer press-down text-tertiary hover:text-primary h-full py-[10px] pl-[4px] focus-visible:-outline-offset-2!',
							connection.status !== 'connected' && !hasInputs
								? 'pr-[12px]'
								: 'pr-[4px]',
						)}
					>
						{linkNotifying ? (
							<CheckIcon className="w-[12px] h-[12px]" />
						) : (
							<LinkIcon className="w-[12px] h-[12px]" />
						)}
					</button>
					{connection.status === 'connected' && (
						<button
							type="button"
							title="Execute"
							disabled={
								writeContract.isPending || (hasInputs && !allInputsFilled)
							}
							className={cx(
								'text-accent cursor-pointer press-down h-full py-[10px] pl-[4px] focus-visible:-outline-offset-2!',
								hasInputs ? 'pr-[4px]' : 'pr-[12px]',
								(writeContract.isPending || (hasInputs && !allInputsFilled)) &&
									'opacity-50 cursor-not-allowed',
							)}
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
							<PlayIcon className="size-[14px]" />
						</button>
					)}
					{hasInputs && (
						<button
							type="button"
							className="text-secondary cursor-pointer press-down h-full py-[10px] pl-[4px] pr-[12px] focus-visible:-outline-offset-2!"
							onClick={() => setIsExpanded(!isExpanded)}
						>
							<ChevronDownIcon
								className={cx('w-[14px] h-[14px]', isExpanded && 'rotate-180')}
							/>
						</button>
					)}
				</div>
			</div>

			{isExpanded && (
				<div className="border-t border-card-border px-[12px] py-[10px] flex flex-col gap-[10px]">
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
						<div className="p-2.5 rounded-md bg-red-500/10 border border-red-500/20">
							<p className="text-[12px] text-red-400">{parsedArgs.error}</p>
						</div>
					)}

					{writeContract.error && (
						<div className="p-2.5 rounded-md bg-red-500/10 border border-red-500/20">
							<p className="text-[12px] text-red-400">
								{'shortMessage' in writeContract.error
									? writeContract.error.shortMessage
									: (writeContract.error.message ?? 'Transaction failed')}
							</p>
						</div>
					)}

					{writeContract.isSuccess && writeContract.data && (
						<div className="p-2.5 rounded-md bg-green-500/10 border border-green-500/20">
							<p className="text-[12px] text-green-400 font-mono break-all">
								tx: {writeContract.data}
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
			<div className="flex items-center gap-[8px]">
				<input
					id={inputId}
					type="checkbox"
					checked={value === 'true'}
					onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
					className="w-[16px] h-[16px] rounded border-base-border"
				/>
				<label htmlFor={inputId} className="text-[12px] text-primary font-mono">
					{displayLabel} <span className="text-secondary">({input.type})</span>
				</label>
			</div>
		)
	}

	if (inputType === 'textarea' || isArrayType(input.type)) {
		return (
			<div className="flex flex-col gap-[4px]">
				<label htmlFor={inputId} className="text-[12px] text-primary font-mono">
					{displayLabel} <span className="text-secondary">({input.type})</span>
				</label>
				<textarea
					id={inputId}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					rows={3}
					className="w-full rounded-[6px] border border-base-border bg-alt px-[10px] py-[6px] text-[13px] text-primary placeholder:text-secondary focus-visible:outline-1 focus-visible:outline-accent resize-none font-mono"
				/>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-[4px]">
			<label htmlFor={inputId} className="text-[12px] text-primary font-mono">
				{displayLabel} <span className="text-secondary">({input.type})</span>
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
