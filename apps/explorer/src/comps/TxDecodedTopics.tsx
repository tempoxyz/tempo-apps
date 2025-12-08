import type { AbiEvent } from 'abitype'
import { useMemo, useState } from 'react'
import {
	type Abi,
	type Hex,
	type Log,
	decodeEventLog,
	getAbiItem,
	parseAbiItem,
} from 'viem'
import {
	decodeEventLog_guessed,
	formatAbiValue,
	useAutoloadAbi,
	useLookupSignature,
} from '#lib/abi'
import { useCopy } from '#lib/hooks'
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

	const signatureAbiItem = useMemo(() => {
		if (!signature) return undefined
		try {
			return parseAbiItem(`event ${signature}`) as AbiEvent
		} catch {
			return undefined
		}
	}, [signature])

	const abiItem = autoloadAbiItem ?? signatureAbiItem

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
				<div className="divide-y divide-card-border">
					<TxDecodedTopics.TopicSection
						topics={log.topics}
						abiItem={abiItem}
						args={decoded?.args}
					/>
					{log.data && log.data !== '0x' && (
						<TxDecodedTopics.DataSection
							data={log.data}
							abiItem={abiItem}
							args={decoded?.args}
						/>
					)}
				</div>
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
								input.indexed ? `index_topic_${i + 1} ` : ''
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
								<span className="text-tertiary">index_topic_{i + 1} </span>
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

	export function TopicSection(props: TopicSection.Props) {
		const { topics, abiItem, args } = props

		const indexedInputs = abiItem.inputs
			.map((input, index) => ({ input, index }))
			.filter(({ input }) => input.indexed)

		return (
			<div className="px-[10px] py-[8px]">
				<div className="text-[11px] text-tertiary mb-[6px]">Topics</div>
				<div className="flex flex-col gap-[4px]">
					{topics.map((topic, topicIndex) => {
						const indexed =
							topicIndex > 0 ? indexedInputs[topicIndex - 1] : undefined
						const argValue =
							indexed && args
								? ((args as Record<string, unknown>)[
										indexed.input.name ?? ''
									] ?? (args as readonly unknown[])[indexed.index])
								: undefined

						return (
							<TopicRow
								key={topic}
								index={topicIndex}
								topic={topic}
								input={indexed?.input}
								value={argValue}
							/>
						)
					})}
				</div>
			</div>
		)
	}
	export namespace TopicSection {
		export interface Props {
			topics: readonly Hex[]
			abiItem: AbiEvent
			args?: Record<string, unknown> | readonly unknown[]
		}
	}

	export function TopicRow(props: TopicRow.Props) {
		const { index, topic, input, value } = props
		const { copy, notifying } = useCopy()

		const displayValue = value !== undefined ? formatAbiValue(value) : topic
		const label = input?.name || (input ? `arg${index}` : undefined)

		return (
			<button
				type="button"
				onClick={() => copy(displayValue)}
				className="flex items-start gap-[8px] text-left cursor-pointer press-down hover:bg-base-alt/50 rounded-[4px] px-[4px] py-[2px] -mx-[4px]"
			>
				<span className="text-[11px] text-tertiary shrink-0">
					{notifying ? (
						<span className="text-primary">copied</span>
					) : label ? (
						`${index}: ${label}`
					) : (
						index
					)}
				</span>
				<span className="text-[11px] text-primary font-mono break-all min-w-0">
					{displayValue}
				</span>
			</button>
		)
	}
	export namespace TopicRow {
		export interface Props {
			index: number
			topic: Hex
			input?: AbiEvent['inputs'][number]
			value?: unknown
		}
	}

	export function DataSection(props: DataSection.Props) {
		const { data, abiItem, args } = props
		const { copy, notifying } = useCopy()
		const [showRaw, setShowRaw] = useState(false)

		const nonIndexedInputs = abiItem.inputs
			.map((input, index) => ({ input, index }))
			.filter(({ input }) => !input.indexed)

		const hasDecodedArgs = Boolean(args && nonIndexedInputs.length > 0)

		return (
			<div className="px-[10px] py-[8px] min-w-0">
				<div className="text-[11px] text-tertiary mb-[6px]">
					{notifying ? (
						<span className="text-primary">copied</span>
					) : (
						<>
							Data
							{hasDecodedArgs && (
								<>
									{' '}
									<button
										type="button"
										onClick={() => setShowRaw(!showRaw)}
										className="text-accent hover:underline cursor-pointer"
									>
										({showRaw ? 'raw' : 'decoded'})
									</button>
								</>
							)}
						</>
					)}
				</div>
				{hasDecodedArgs && !showRaw ? (
					<div className="flex flex-col gap-[4px]">
						{nonIndexedInputs.map(({ input, index }) => {
							const argValue = args
								? ((args as Record<string, unknown>)[input.name ?? ''] ??
									(args as readonly unknown[])[index])
								: undefined

							return (
								<DataRow
									key={input.name ?? index}
									input={input}
									index={index}
									value={argValue}
								/>
							)
						})}
					</div>
				) : (
					<button
						type="button"
						onClick={() => copy(data)}
						className="w-full text-left cursor-pointer press-down hover:bg-base-alt/50 rounded-[4px] px-[4px] py-[2px] -mx-[4px] min-w-0 max-w-full"
					>
						<span className="text-[11px] text-primary font-mono break-all block [overflow-wrap:anywhere] min-w-0">
							{data}
						</span>
					</button>
				)}
			</div>
		)
	}
	export namespace DataSection {
		export interface Props {
			data: Hex
			abiItem: AbiEvent
			args?: Record<string, unknown> | readonly unknown[]
		}
	}

	export function DataRow(props: DataRow.Props) {
		const { input, index, value } = props
		const { copy, notifying } = useCopy()

		const displayValue = value !== undefined ? formatAbiValue(value) : ''
		const label = input.name || `arg${index}`

		return (
			<button
				type="button"
				onClick={() => copy(displayValue)}
				className="flex items-start gap-[8px] text-left cursor-pointer press-down hover:bg-base-alt/50 rounded-[4px] px-[4px] py-[2px] -mx-[4px] w-full"
			>
				<span className="text-[11px] text-tertiary shrink-0">
					{notifying ? (
						<span className="text-primary">copied</span>
					) : (
						<>{label}:</>
					)}
				</span>
				<span className="text-[11px] text-primary font-mono break-all">
					{displayValue}
				</span>
			</button>
		)
	}
	export namespace DataRow {
		export interface Props {
			input: AbiEvent['inputs'][number]
			index: number
			value?: unknown
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
					{notifying ? <span className="text-primary">copied</span> : index}
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
