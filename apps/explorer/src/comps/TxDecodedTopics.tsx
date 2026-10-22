import { ChoiceGroup, CopyButton, Hex, style, variants } from '@tempoxyz/ds'
import type { AbiEvent } from 'abitype'
import { useMemo, useState } from 'react'
import { decodeEventLog, getAbiItem, parseAbiItem } from 'viem'
import type { Abi, Hex as HexType, Log } from 'viem'
import { Abis } from '#lib/abis'
import { decodeEventLog_guessed, formatAbiValue } from '#lib/domain/contracts'
import { useAutoloadAbi, useLookupSignature } from '#lib/queries'
import { codeIdentifier } from '#styles/explorer'

export function TxDecodedTopics(
	props: TxDecodedTopics.Props,
): React.JSX.Element {
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
				topics: log.topics as [HexType, ...HexType[]],
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

	if (!isFetched || !abiItem) return <TxDecodedTopics.RawTopics log={log} />

	return (
		<div {...styles.panel()}>
			<TxDecodedTopics.SignatureHeader abiItem={abiItem} />
			<TxDecodedTopics.ArgumentsSection
				abiItem={abiItem}
				args={decoded?.args}
				log={log}
			/>
		</div>
	)
}

export namespace TxDecodedTopics {
	export interface Props {
		log: Log
	}

	export function SignatureHeader(
		props: SignatureHeader.Props,
	): React.JSX.Element {
		const { abiItem } = props

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
			<div {...styles.header()}>
				<code {...styles.signature()}>
					<span {...styles.secondary()}>Name </span>
					<span {...codeIdentifier()}>{abiItem.name}</span>
					<span {...styles.secondary()}> (</span>
					{abiItem.inputs.map((input, i) => (
						<span key={`${input.type}-${input.name ?? i}`}>
							{i > 0 && <span {...styles.secondary()}>, </span>}
							{input.indexed && (
								<span {...styles.secondary()}>topic[{i + 1}] </span>
							)}
							<span {...styles.secondary()}>{input.type}</span>
							{input.name && <span {...styles.primary()}> {input.name}</span>}
						</span>
					))}
					<span {...styles.secondary()}>)</span>
				</code>
				<CopyButton
					aria-label="Copy signature"
					value={signatureText}
					{...styles.copy()}
				/>
			</div>
		)
	}
	export namespace SignatureHeader {
		export interface Props {
			abiItem: AbiEvent
		}
	}

	export function ArgumentsSection(
		props: ArgumentsSection.Props,
	): React.JSX.Element | null {
		const { abiItem, args, log } = props
		const [view, setView] = useState<'decoded' | 'raw'>('decoded')

		if (!args || abiItem.inputs.length === 0) return null

		return (
			<div {...styles.section()}>
				<div {...styles.argumentsLabel()}>
					<span>Arguments</span>
					<ChoiceGroup.Root
						aria-label="Arguments view"
						onValueChange={setView}
						size="small"
						value={view}
					>
						<ChoiceGroup.Item value="decoded">Decoded</ChoiceGroup.Item>
						<ChoiceGroup.Item value="raw">Raw</ChoiceGroup.Item>
					</ChoiceGroup.Root>
				</div>
				{view === 'raw' ? (
					<div {...styles.rawStack()}>
						<div {...styles.topics()}>
							{log.topics.map((topic, i) => (
								<RawTopicRow key={topic} index={i} topic={topic} />
							))}
						</div>
						{log.data && log.data !== '0x' && (
							<RawData data={log.data} inline />
						)}
					</div>
				) : (
					<div {...styles.argumentGrid()}>
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

	export function ArgumentRow(props: ArgumentRow.Props): React.JSX.Element {
		const { input, value } = props

		const displayValue = value !== undefined ? formatAbiValue(value) : ''
		const label = input.name || input.type

		return (
			<div {...styles.argumentRow()}>
				<span {...styles.argumentLabel()}>{label}</span>
				<span {...styles.value()}>{displayValue}</span>
				<CopyButton
					aria-label={`Copy ${label}`}
					value={displayValue}
					{...styles.copy()}
				/>
			</div>
		)
	}
	export namespace ArgumentRow {
		export interface Props {
			input: AbiEvent['inputs'][number]
			value?: unknown
		}
	}

	/** The log's data, in full, with a button that copies it. */
	export function RawData(props: RawData.Props): React.JSX.Element {
		const { data, inline = false } = props

		return (
			<div {...styles.data({ inline })}>
				<div {...styles.label({ inline })}>Data</div>
				<div {...styles.dataRow()}>
					<span {...styles.value()}>{data}</span>
					<CopyButton aria-label="Copy data" value={data} {...styles.copy()} />
				</div>
			</div>
		)
	}
	export namespace RawData {
		export interface Props {
			data: HexType
			/** Sits under the raw topics of the arguments view. */
			inline?: boolean | undefined
		}
	}

	export function RawTopics(props: RawTopics.Props): React.JSX.Element {
		const { log } = props

		return (
			<div {...styles.panel()}>
				<div {...styles.rawHeader()}>
					<span {...styles.label()}>Raw event</span>
				</div>
				<div {...styles.divided()}>
					<div {...styles.section()}>
						<div {...styles.label()}>Topics</div>
						<div {...styles.topics()}>
							{log.topics.map((topic, i) => (
								<RawTopicRow key={topic} index={i} topic={topic} />
							))}
						</div>
					</div>
					{log.data && log.data !== '0x' && <RawData data={log.data} />}
				</div>
			</div>
		)
	}
	export namespace RawTopics {
		export interface Props {
			log: Log
		}
	}

	export function RawTopicRow(props: RawTopicRow.Props): React.JSX.Element {
		const { index, topic } = props

		return (
			<div {...styles.topicRow()}>
				<span {...styles.topicLabel()}>topic[{index}]</span>
				<Hex.Root value={topic} {...styles.topic()}>
					<Hex.Text />
					<Hex.Copy aria-label={`Copy topic ${index}`} />
				</Hex.Root>
			</div>
		)
	}
	export namespace RawTopicRow {
		export interface Props {
			index: number
			topic: HexType
		}
	}
}

namespace styles {
	// A well on the section surface, matching the decoded calldata panel.
	export const panel = style({
		backgroundColor: 'background.primary',
		borderRadius: '8',
		minWidth: '0 !custom',
		width: '100% !custom',
	})

	export const header = style({
		alignItems: 'flex-start',
		borderBottomWidth: '1',
		borderColor: 'grayAlpha.200',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const signature = style({
		color: 'foreground',
		typography: 'label.12.mono',
		wordBreak: 'break-all',
	})

	export const primary = style({ color: 'foreground' })

	export const secondary = style({ color: 'gray.900' })

	// Negative margins let the 32px copy button sit in a 16px text row without
	// growing it.
	export const copy = style({
		flexShrink: '0 !custom',
		marginBlock: '-8px !custom',
		marginRight: '-8px !custom',
	})

	export const section = style({
		minWidth: '0 !custom',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const argumentsLabel = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'flex',
		gap: '8',
		marginBottom: '8',
		typography: 'label.12',
	})

	export const rawStack = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const topics = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
	})

	// Label, value and copy button; each row joins the columns as a subgrid.
	export const argumentGrid = style({
		columnGap: '8',
		display: 'grid',
		gridTemplateColumns: 'auto minmax(0, 1fr) auto !custom',
		rowGap: '8',
	})

	export const argumentRow = style({
		alignItems: 'start',
		display: 'grid',
		gridColumn: '1 / -1',
		gridTemplateColumns: 'subgrid',
	})

	export const argumentLabel = style({
		color: 'gray.900',
		typography: 'label.12',
		whiteSpace: 'pre',
	})

	export const value = style({
		color: 'foreground',
		flex: '1 !custom',
		minWidth: '0 !custom',
		overflowWrap: 'anywhere',
		typography: 'label.12.mono',
		wordBreak: 'break-all',
	})

	export const label = variants({
		base: {
			color: 'gray.900',
			marginBottom: '8',
			typography: 'label.12',
		},
		defaultVariants: { inline: false },
		variants: {
			inline: { false: {}, true: { marginBottom: '4' } },
		},
	})

	export const data = variants({
		base: { minWidth: '0 !custom' },
		defaultVariants: { inline: false },
		variants: {
			inline: { false: { paddingBlock: '8', paddingInline: '12' }, true: {} },
		},
	})

	export const dataRow = style({
		alignItems: 'flex-start',
		display: 'flex',
		gap: '8',
	})

	export const rawHeader = style({
		borderBottomWidth: '1',
		borderColor: 'grayAlpha.200',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const divided = style({
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: '1',
				borderColor: 'grayAlpha.200',
			},
		},
	})

	export const topicRow = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const topicLabel = style({
		color: 'gray.900',
		flexShrink: '0 !custom',
		typography: 'label.12',
	})

	// Hex leaves its flex sizing unset; the topic takes the rest of the row.
	export const topic = style({ flex: '1 !custom', minWidth: '0 !custom' })
}
