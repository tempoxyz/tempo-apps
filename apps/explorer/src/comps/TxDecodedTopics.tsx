import type { AbiEvent } from 'abitype'
import { useMemo, useState } from 'react'
import {
	type Abi,
	decodeEventLog,
	getAbiItem,
	type Hex,
	type Log,
	parseAbiItem,
} from 'viem'
import { Abis } from 'viem/tempo'
import { decodeEventLog_guessed, formatAbiValue } from '#lib/domain/contracts'
import { useCopy } from '#lib/hooks'
import { useAutoloadAbi, useLookupSignature } from '#lib/queries'
import CopyIcon from '~icons/lucide/copy'

export function TxDecodedTopics(props: TxDecodedTopics.Props) {
	const { log } = props
	const eventSelector = log.topics[0]

	const { data: autoloadAbi } = useAutoloadAbi({
		address: log.address,
		enabled: Boolean(eventSelector),
	})

	const { data: signature, isFetched } = useLookupSignature({
		selector: eventSelector,
	})

	const autoloadAbiItem = useMemo(() => {
		if (!autoloadAbi || !eventSelector) return undefined
		return getAbiItem({
			abi: autoloadAbi as unknown as Abi,
			name: eventSelector,
		}) as AbiEvent | undefined
	}, [autoloadAbi, eventSelector])

	const tempoTsAbiItem = useMemo(() => {
		if (!eventSelector) return undefined
		const tempoTsAbi = Object.values(Abis).flat()
		return getAbiItem({
			abi: tempoTsAbi as unknown as Abi,
			name: eventSelector,
		}) as AbiEvent | undefined
	}, [eventSelector])

	const signatureAbiItem = useMemo(() => {
		if (!signature) return undefined
		try {
			return parseAbiItem(`event ${signature}`) as AbiEvent
		} catch {
			return undefined
		}
	}, [signature])

	const abiItem = autoloadAbiItem ?? tempoTsAbiItem ?? signatureAbiItem

	const decoded = useMemo(() => {
		if (!abiItem) return undefined

		try {
			return decodeEventLog({
				abi: [abiItem],
				topics: log.topics as [Hex, ...Hex[]],
				data: log.data,
			})
		} catch {
			// If decoding with given indexed parameters fails, try to guess the
			// positions of the indexed parameters
			return decodeEventLog_guessed({
				abiItem,
				topics: log.topics,
				data: log.data,
			})
		}
	}, [abiItem, log.topics, log.data])

	if (!isFetched) return <TxDecodedTopics.RawTopics log={log} />
	if (!abiItem) return <TxDecodedTopics.RawTopics log={log} />

	return (
		<div className="flex flex-col gap-[8px] w-full min-w-0 max-w-full overflow-hidden">
			<div className="bg-distinct rounded-[6px] overflow-hidden w-full min-w-0">
				<TxDecodedTopics.SignatureHeader abiItem={abiItem} />
				<TxDecodedTopics.ArgumentsSection
					abiItem={abiItem}
					args={decoded?.args}
					log={log}
				/>
			</div>
		</div>
	)
}

export namespace TxDecodedTopics {
	export interface Props {
		log: Log
	}

	export function SignatureHeader(props: SignatureHeader.Props) {
		const { abiItem } = props
		const { copy, notifying } = useCopy()

		const signatureText = useMemo(
			() =>
				`${abiItem.name}(${abiItem.inputs
					.map(
						(input, i) =>
							`${
								input.indexed ? `topic[${i + 1}] ` : ''
							}${input.type}${input.name ? ` ${input.name}` : ''}`,
					)
					.join(', ')})`,
			[abiItem],
		)

		return (
			<div className="flex items-start justify-between px-[10px] py-[8px] border-b border-card-border gap-[8px]">
				<code className="text-[11px] text-primary font-mono break-all">
					<span className="text-tertiary">Name </span>
					<span className="text-base-content-positive">{abiItem.name}</span>
					<span className="text-secondary"> (</span>
					{abiItem.inputs.map((input, i) => (
						<span key={`${input.type}-${input.name ?? i}`}>
							{i > 0 && <span className="text-secondary">, </span>}
							{input.indexed && (
								<span className="text-tertiary">topic[{i + 1}] </span>
							)}
							<span className="text-secondary">{input.type}</span>
							{input.name && (
								<span className="text-primary"> {input.name}</span>
							)}
						</span>
					))}
					<span className="text-secondary">)</span>
				</code>
				<div className="flex items-center gap-[4px] text-tertiary shrink-0">
					{notifying && <span className="text-[11px] select-none">copied</span>}
					<button
						type="button"
						className="press-down cursor-pointer hover:text-secondary p-[4px]"
						onClick={() => copy(signatureText)}
						title="Copy signature"
					>
						<CopyIcon className="size-[14px]" />
					</button>
				</div>
			</div>
		)
	}
	export namespace SignatureHeader {
		export interface Props {
			abiItem: AbiEvent
		}
	}

	export function ArgumentsSection(props: ArgumentsSection.Props) {
		const { abiItem, args, log } = props
		const [showRaw, setShowRaw] = useState(false)

		if (!args || abiItem.inputs.length === 0) return null

		return (
			<div className="px-[10px] py-[8px]">
				<div className="text-[11px] text-tertiary mb-[6px]">
					Arguments{' '}
					<button
						type="button"
						onClick={() => setShowRaw(!showRaw)}
						className="text-accent hover:underline cursor-pointer press-down"
					>
						({showRaw ? 'raw' : 'decoded'})
					</button>
				</div>
				{showRaw ? (
					<div className="flex flex-col gap-[8px]">
						<div className="flex flex-col gap-[4px]">
							{log.topics.map((topic, i) => (
								<RawTopicRow key={topic} index={i} topic={topic} />
							))}
						</div>
						{log.data && log.data !== '0x' && <RawDataInline data={log.data} />}
					</div>
				) : (
					<div className="grid" style={{ gridTemplateColumns: 'auto 1fr' }}>
						{abiItem.inputs.map((input, index) => {
							const argValue =
								(args as Record<string, unknown>)[input.name ?? ''] ??
								(args as readonly unknown[])[index]

							return (
								<ArgumentRow
									key={input.name ?? index}
									input={input}
									value={argValue}
								/>
							)
						})}
					</div>
				)}
			</div>
		)
	}
	export namespace ArgumentsSection {
		export interface Props {
			abiItem: AbiEvent
			args?: Record<string, unknown> | readonly unknown[]
			log: Log
		}
	}

	export function ArgumentRow(props: ArgumentRow.Props) {
		const { input, value } = props
		const { copy, notifying } = useCopy()

		const displayValue = value !== undefined ? formatAbiValue(value) : ''
		const label = input.name || input.type

		return (
			<button
				type="button"
				onClick={() => copy(displayValue)}
				className="col-span-2 grid grid-cols-subgrid items-start gap-[8px] text-left cursor-pointer press-down hover:bg-base-alt/50 rounded-[4px] px-[4px] py-[4px] -mx-[4px]"
			>
				<span className="text-[11px] text-tertiary whitespace-pre">
					{notifying ? (
						<span className="text-primary">
							{'copied'.padEnd(label.length + 1)}
						</span>
					) : (
						<>{label}:</>
					)}
				</span>
				<span className="text-[11px] text-primary font-mono break-all min-w-0">
					{displayValue}
				</span>
			</button>
		)
	}
	export namespace ArgumentRow {
		export interface Props {
			input: AbiEvent['inputs'][number]
			value?: unknown
		}
	}

	export function RawDataInline(props: RawDataInline.Props) {
		const { data } = props
		const { copy, notifying } = useCopy()

		return (
			<div>
				<div className="text-[11px] text-tertiary mb-[4px]">
					{notifying ? <span className="text-primary">copied</span> : 'Data'}
				</div>
				<button
					type="button"
					onClick={() => copy(data)}
					className="w-full text-left cursor-pointer press-down hover:bg-base-alt/50 rounded-[4px] px-[4px] py-[2px] -mx-[4px] min-w-0 max-w-full"
				>
					<span className="text-[11px] text-primary font-mono break-all block [overflow-wrap:anywhere] min-w-0">
						{data}
					</span>
				</button>
			</div>
		)
	}
	export namespace RawDataInline {
		export interface Props {
			data: Hex
		}
	}

	export function RawTopics(props: RawTopics.Props) {
		const { log } = props

		return (
			<div className="flex flex-col gap-[8px] w-full min-w-0 max-w-full overflow-hidden">
				<div className="bg-distinct rounded-[6px] overflow-hidden w-full min-w-0">
					<div className="px-[10px] py-[8px] border-b border-card-border">
						<span className="text-[11px] text-tertiary">Raw event</span>
					</div>
					<div className="divide-y divide-card-border">
						<div className="px-[10px] py-[8px] min-w-0">
							<div className="text-[11px] text-tertiary mb-[6px]">Topics</div>
							<div className="flex flex-col gap-[4px]">
								{log.topics.map((topic, i) => (
									<RawTopicRow key={topic} index={i} topic={topic} />
								))}
							</div>
						</div>
						{log.data && log.data !== '0x' && (
							<RawDataSection data={log.data} />
						)}
					</div>
				</div>
			</div>
		)
	}
	export namespace RawTopics {
		export interface Props {
			log: Log
		}
	}

	export function RawTopicRow(props: RawTopicRow.Props) {
		const { index, topic } = props
		const { copy, notifying } = useCopy()

		return (
			<button
				type="button"
				onClick={() => copy(topic)}
				className="flex items-start gap-[8px] text-left cursor-pointer press-down hover:bg-base-alt/50 rounded-[4px] px-[4px] py-[2px] -mx-[4px]"
			>
				<span className="text-[11px] text-tertiary shrink-0">
					{notifying ? (
						<span className="text-primary">copied</span>
					) : (
						`topic[${index}]`
					)}
				</span>
				<span className="text-[11px] text-primary font-mono break-all min-w-0">
					{topic}
				</span>
			</button>
		)
	}
	export namespace RawTopicRow {
		export interface Props {
			index: number
			topic: Hex
		}
	}

	export function RawDataSection(props: RawDataSection.Props) {
		const { data } = props
		const { copy, notifying } = useCopy()

		return (
			<div className="px-[10px] py-[8px] min-w-0">
				<div className="text-[11px] text-tertiary mb-[6px]">
					{notifying ? <span className="text-primary">copied</span> : 'Data'}
				</div>
				<button
					type="button"
					onClick={() => copy(data)}
					className="w-full text-left cursor-pointer press-down hover:bg-base-alt/50 rounded-[4px] px-[4px] py-[2px] -mx-[4px] min-w-0 max-w-full"
				>
					<span className="text-[11px] text-primary font-mono break-all block [overflow-wrap:anywhere] min-w-0">
						{data}
					</span>
				</button>
			</div>
		)
	}
	export namespace RawDataSection {
		export interface Props {
			data: Hex
		}
	}
}
