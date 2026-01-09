import type { AbiFunction } from 'abitype'
import { useMemo, useState } from 'react'
import {
	type Abi,
	type Address,
	decodeAbiParameters,
	type Hex,
	parseAbiItem,
	slice,
} from 'viem'
import { formatAbiValue, getAbiItem } from '#lib/domain/contracts'
import { useCopy } from '#lib/hooks'
import { useAutoloadAbi, useLookupSignature } from '#lib/queries'
import CopyIcon from '~icons/lucide/copy'

export function TxDecodedCalldata(props: TxDecodedCalldata.Props) {
	const { address, data } = props
	const selector = slice(data, 0, 4)
	const copySignature = useCopy()
	const copyRaw = useCopy()
	const [showRaw, setShowRaw] = useState(false)

	const { data: autoloadAbi } = useAutoloadAbi({
		address,
		enabled: Boolean(data) && data !== '0x',
	})

	const { data: signature, isFetched } = useLookupSignature({
		selector,
	})

	const signatureAbi = useMemo(() => {
		if (!signature) return
		return [parseAbiItem(`function ${signature}`) as AbiFunction] as const
	}, [signature])

	const abiItem = useMemo(() => {
		const autoloadAbiItem =
			autoloadAbi &&
			(getAbiItem({
				abi: autoloadAbi as unknown as Abi,
				selector,
			}) as AbiFunction)

		const signatureAbiItem =
			signatureAbi &&
			(getAbiItem({
				abi: signatureAbi,
				selector,
			}) as AbiFunction)

		if (autoloadAbiItem) {
			if (
				(signatureAbiItem?.inputs?.length || 0) >
				(autoloadAbiItem?.inputs?.length || 0)
			)
				return signatureAbiItem
			return autoloadAbiItem
		}

		return signatureAbiItem
	}, [autoloadAbi, signatureAbi, selector])

	const rawArgs = abiItem && data.length > 10 ? slice(data, 4) : undefined
	const { args } = useMemo(() => {
		if (abiItem && rawArgs && 'name' in abiItem && 'inputs' in abiItem) {
			try {
				return {
					args: decodeAbiParameters(abiItem.inputs, rawArgs),
				}
			} catch {}
		}
		return { args: undefined }
	}, [abiItem, rawArgs])

	if (!isFetched || !abiItem)
		return (
			<div className="bg-distinct rounded-[6px] overflow-hidden">
				<div className="relative px-[10px] py-[8px]">
					<pre className="text-[12px] text-primary break-all whitespace-pre-wrap font-mono max-h-[300px] overflow-auto pr-[40px]">
						{data}
					</pre>
					<div className="absolute top-[8px] right-[10px] flex items-center gap-[4px] text-tertiary bg-distinct pl-[8px]">
						{copyRaw.notifying && (
							<span className="text-[11px] select-none">copied</span>
						)}
						<button
							type="button"
							className="press-down cursor-pointer hover:text-secondary p-[4px]"
							onClick={() => copyRaw.copy(data)}
							title="Copy raw data"
						>
							<CopyIcon className="size-[14px]" />
						</button>
					</div>
				</div>
			</div>
		)

	return (
		<div className="flex flex-col gap-[8px]">
			<div className="bg-distinct rounded-[6px] overflow-hidden">
				<div className="flex items-center justify-between px-[10px] py-[8px] border-b border-card-border">
					<code className="text-[12px] text-primary font-mono">
						<span className="text-base-content-positive">
							{'name' in abiItem ? abiItem.name : selector}
						</span>
						<span className="text-secondary">(</span>
						{abiItem.inputs?.map((input, i) => (
							<span key={`${input.type}-${input.name ?? i}`}>
								{i > 0 && <span className="text-secondary">, </span>}
								<span className="text-secondary">{input.type}</span>
								{input.name && (
									<span className="text-primary"> {input.name}</span>
								)}
							</span>
						))}
						<span className="text-secondary">)</span>
					</code>
					<div className="flex items-center gap-[4px] text-tertiary">
						{copySignature.notifying && (
							<span className="text-[11px] select-none">copied</span>
						)}
						<button
							type="button"
							className="press-down cursor-pointer hover:text-secondary p-[4px]"
							onClick={() =>
								copySignature.copy(
									`${abiItem.name}(${abiItem.inputs?.map((input) => `${input.type}${input.name ? ` ${input.name}` : ''}`).join(', ') ?? ''})`,
								)
							}
							title="Copy signature"
						>
							<CopyIcon className="size-[14px]" />
						</button>
					</div>
				</div>
				{args && args.length > 0 && (
					<div className="divide-y divide-card-border">
						{abiItem.inputs?.map((input, i) => (
							<TxDecodedCalldata.ArgumentRow
								key={`${input.type}-${input.name ?? i}`}
								input={input}
								value={args[i]}
							/>
						))}
					</div>
				)}
			</div>
			<button
				type="button"
				onClick={() => setShowRaw(!showRaw)}
				className="text-[11px] text-accent bg-accent/10 hover:bg-accent/15 rounded-full px-[10px] py-[4px] cursor-pointer press-down w-fit"
			>
				{showRaw ? 'Hide' : 'Show'} raw
			</button>
			{showRaw && (
				<div className="bg-distinct rounded-[6px] overflow-hidden">
					<div className="relative px-[10px] py-[8px]">
						<pre className="text-[12px] text-primary break-all whitespace-pre-wrap font-mono max-h-[300px] overflow-auto pr-[40px]">
							{data}
						</pre>
						<div className="absolute top-[8px] right-[10px] flex items-center gap-[4px] text-tertiary bg-distinct pl-[8px]">
							{copyRaw.notifying && (
								<span className="text-[11px] select-none">copied</span>
							)}
							<button
								type="button"
								className="press-down cursor-pointer hover:text-secondary p-[4px]"
								onClick={() => copyRaw.copy(data)}
								title="Copy raw data"
							>
								<CopyIcon className="size-[14px]" />
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export namespace TxDecodedCalldata {
	export interface Props {
		address?: Address | null
		data: Hex
	}

	export function ArgumentRow(props: ArgumentRow.Props) {
		const { input, value } = props
		const { copy, notifying } = useCopy()
		const formattedValue = formatAbiValue(value)

		return (
			<button
				type="button"
				onClick={() => copy(formattedValue)}
				className="flex items-start gap-[12px] px-[10px] py-[8px] text-[12px] font-mono w-full text-left cursor-pointer press-down hover:bg-base-alt/50 transition-colors"
			>
				<span className="text-secondary shrink-0 min-w-[120px]">
					{notifying ? (
						<span className="text-primary">copied</span>
					) : (
						<>
							{input.type}
							{input.name && (
								<span className="text-primary"> {input.name}</span>
							)}
						</>
					)}
				</span>
				<span className="text-primary break-all">{formattedValue}</span>
			</button>
		)
	}

	export namespace ArgumentRow {
		export interface Props {
			input: { type: string; name?: string }
			value: unknown
		}
	}
}
