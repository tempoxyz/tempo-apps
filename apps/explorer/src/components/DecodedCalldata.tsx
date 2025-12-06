import { loaders, whatsabi } from '@shazow/whatsabi'
import { queryOptions, useQuery } from '@tanstack/react-query'
import type { AbiFunction } from 'abitype'
import { useMemo, useState } from 'react'
import {
	type Abi,
	type Address,
	decodeAbiParameters,
	getAbiItem as getAbiItem_viem,
	type Hex,
	parseAbiItem,
	slice,
	stringify,
} from 'viem'
import { getPublicClient } from 'wagmi/actions'
import { useCopy } from '#lib/hooks.ts'
import { config } from '#wagmi.config.ts'
import CopyIcon from '~icons/lucide/copy'

export function DecodedCalldata(props: DecodedCalldata.Props) {
	const { address, data } = props
	const selector = slice(data, 0, 4)
	const copySignature = useCopy()
	const copyRaw = useCopy()
	const [showRaw, setShowRaw] = useState(false)

	const { data: autoloadAbi } = DecodedCalldata.useAutoloadAbi({
		address,
		enabled: Boolean(data) && data !== '0x',
	})

	const { data: signature, isFetched } = DecodedCalldata.useLookupSignature({
		selector,
	})

	const signatureAbi = useMemo(() => {
		if (!signature) return
		return [parseAbiItem(`function ${signature}`) as AbiFunction] as const
	}, [signature])

	const abiItem = useMemo(() => {
		const autoloadAbiItem =
			autoloadAbi &&
			(DecodedCalldata.getAbiItem({
				abi: autoloadAbi as unknown as Abi,
				selector,
			}) as AbiFunction)

		const signatureAbiItem =
			signatureAbi &&
			(DecodedCalldata.getAbiItem({
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

	if (!isFetched)
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

	if (!abiItem) return null

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
							<DecodedCalldata.ArgumentRow
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
				className="text-[11px] text-accent hover:underline text-left cursor-pointer press-down"
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

export namespace DecodedCalldata {
	export interface Props {
		address?: Address | null
		data: Hex
	}

	export function ArgumentRow(props: ArgumentRow.Props) {
		const { input, value } = props
		const { copy, notifying } = useCopy()
		const formattedValue = DecodedCalldata.formatValue(value)

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

	export function useAutoloadAbi(args: useAutoloadAbi.Parameters) {
		const { address, enabled } = args
		const client = getPublicClient(config)

		return useQuery(
			queryOptions({
				enabled: enabled && Boolean(address) && Boolean(client),
				gcTime: Number.POSITIVE_INFINITY,
				staleTime: Number.POSITIVE_INFINITY,
				queryKey: ['autoload-abi', address],
				async queryFn() {
					if (!address) throw new Error('address is required')
					if (!client) throw new Error('client is required')

					const result = await whatsabi.autoload(address, {
						provider: client,
						followProxies: true,
						abiLoader: new loaders.MultiABILoader([
							new loaders.SourcifyABILoader({
								chainId: client.chain?.id,
							}),
						]),
					})

					if (!result.abi.some((item) => (item as { name?: string }).name))
						return null

					return result.abi.map((abiItem) => ({
						...abiItem,
						outputs:
							'outputs' in abiItem && abiItem.outputs ? abiItem.outputs : [],
					}))
				},
			}),
		)
	}

	export namespace useAutoloadAbi {
		export interface Parameters {
			address?: Address | null
			enabled?: boolean
		}
	}

	export function useLookupSignature(args: useLookupSignature.Parameters) {
		const { enabled = true, selector } = args

		return useQuery(
			queryOptions({
				enabled: enabled && Boolean(selector),
				gcTime: Number.POSITIVE_INFINITY,
				staleTime: Number.POSITIVE_INFINITY,
				queryKey: ['lookup-signature', selector],
				async queryFn() {
					if (!selector) throw new Error('selector is required')

					const signature =
						selector.length === 10
							? await loaders.defaultSignatureLookup.loadFunctions(selector)
							: await loaders.defaultSignatureLookup.loadEvents(selector)

					return signature[0] ?? null
				},
			}),
		)
	}

	export namespace useLookupSignature {
		export interface Parameters {
			enabled?: boolean
			selector?: Hex
		}
	}

	export function getAbiItem({
		abi,
		selector,
	}: {
		abi: Abi
		selector: Hex
	}): AbiFunction | undefined {
		const abiItem =
			(getAbiItem_viem({
				abi: abi.map((x) => ({
					...x,
					inputs: (x as AbiFunction).inputs || [],
					outputs: (x as AbiFunction).outputs || [],
				})),
				name: selector,
			}) as AbiFunction) ||
			abi.find((x) => (x as AbiFunction).name === selector) ||
			abi.find((x) => (x as { selector?: string }).selector === selector)

		if (!abiItem) return

		return {
			...abiItem,
			outputs: abiItem.outputs || [],
			inputs: abiItem.inputs || [],
			name: abiItem.name || (abiItem as { selector?: string }).selector || '',
		} as AbiFunction
	}

	export function formatValue(value: unknown): string {
		if (typeof value === 'bigint') {
			return value.toString()
		}
		if (Array.isArray(value)) {
			return `[${value.map(formatValue).join(', ')}]`
		}
		if (typeof value === 'object' && value !== null) {
			return stringify(value)
		}
		return String(value ?? '')
	}
}
