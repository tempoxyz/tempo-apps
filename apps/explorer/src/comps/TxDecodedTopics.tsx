import { IconButton, Tooltip, style } from '@tempoxyz/ds/platform'
import { Check, Copy } from '@tempoxyz/ds/platform/icons'
import type { AbiEvent } from 'abitype'
import { useMemo, useState } from 'react'
import { decodeEventLog, getAbiItem, parseAbiItem } from 'viem'
import type { Abi, Hex, Log } from 'viem'
import { cx } from 'zyzz'
import { Abis } from '#lib/abis'
import { decodeEventLog_guessed, formatAbiValue } from '#lib/domain/contracts'
import { useCopy } from '#lib/hooks'
import { useAutoloadAbi, useLookupSignature } from '#lib/queries'
import { Choices } from '#comps/ui/Choices'
import { codeIdentifier, pressDown, transitionColors } from '#styles/explorer'

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
		<div {...styles.root()}>
			<div {...styles.panel()}>
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
				<Tooltip content="Copy signature">
					<IconButton
						{...styles.copyButton()}
						aria-label="Copy signature"
						onClick={() => copy(signatureText)}
						scale="small"
						variant="tertiary"
					>
						{notifying ? <Check /> : <Copy />}
					</IconButton>
				</Tooltip>
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
		const [view, setView] = useState<'decoded' | 'raw'>('decoded')

		if (!args || abiItem.inputs.length === 0) return null

		return (
			<div {...styles.section()}>
				<div {...styles.argumentsLabel()}>
					<span>Arguments</span>
					<Choices
						items={argumentViews}
						label="Arguments view"
						onChange={setView}
						value={view}
					/>
				</div>
				{view === 'raw' ? (
					<div {...styles.rawStack()}>
						<div {...styles.topics()}>
							{log.topics.map((topic, i) => (
								<RawTopicRow key={topic} index={i} topic={topic} />
							))}
						</div>
						{log.data && log.data !== '0x' && <RawDataInline data={log.data} />}
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

	export function ArgumentRow(props: ArgumentRow.Props) {
		const { input, value } = props
		const { copy } = useCopy()

		const displayValue = value !== undefined ? formatAbiValue(value) : ''
		const label = input.name || input.type

		return (
			<button
				type="button"
				onClick={() => copy(displayValue)}
				{...cx(styles.argumentRow(), pressDown(), transitionColors())}
			>
				<span {...styles.argumentLabel()}>{label}:</span>
				<span {...styles.hex()}>{displayValue}</span>
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
		const { copy } = useCopy()

		return (
			<div>
				<div {...cx(styles.label(), styles.inlineLabel())}>Data</div>
				<button
					type="button"
					onClick={() => copy(data)}
					{...cx(styles.dataButton(), pressDown(), transitionColors())}
				>
					<span {...styles.data()}>{data}</span>
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
			<div {...styles.root()}>
				<div {...styles.panel()}>
					<div {...styles.rawHeader()}>
						<span {...styles.label()}>Raw event</span>
					</div>
					<div {...styles.divided()}>
						<div {...styles.section()}>
							<div {...cx(styles.label(), styles.sectionLabel())}>Topics</div>
							<div {...styles.topics()}>
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
		const { copy } = useCopy()

		return (
			<button
				type="button"
				onClick={() => copy(topic)}
				{...cx(styles.topicRow(), pressDown(), transitionColors())}
			>
				<span {...styles.topicLabel()}>topic[{index}]</span>
				<span {...styles.hex()}>{topic}</span>
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
		const { copy } = useCopy()

		return (
			<div {...styles.section()}>
				<div {...cx(styles.label(), styles.sectionLabel())}>Data</div>
				<button
					type="button"
					onClick={() => copy(data)}
					{...cx(styles.dataButton(), pressDown(), transitionColors())}
				>
					<span {...styles.data()}>{data}</span>
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

const argumentViews = [
	{ label: 'Decoded', value: 'decoded' },
	{ label: 'Raw', value: 'raw' },
] as const

// Copyable rows sit flush with the surrounding text: the padding that gives
// them a hover fill is pulled back out with a negative inline margin.
const copyRow = {
	borderRadius: '3xs',
	cursor: 'pointer',
	marginInline: '-4px !custom',
	paddingInline: '4',
	textAlign: 'left',
	'@media (hover: hover)': {
		':hover': { backgroundColor: 'container.regular' },
	},
} as const

namespace styles {
	export const root = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		maxWidth: '100% !custom',
		minWidth: '0 !custom',
		overflow: 'hidden',
		width: '100% !custom',
	})

	// An opaque well that matches the decoded calldata panel. It clips, so
	// focus rings inside it are drawn inset (the element type beats
	// IconButton's own offset).
	export const panel = style({
		backgroundColor: 'background.primary',
		borderRadius: '2xs',
		minWidth: '0 !custom',
		overflow: 'hidden',
		width: '100% !custom',
		selectors: { '& button:focus-visible': { outlineOffset: '-2px' } },
	})

	export const header = style({
		alignItems: 'flex-start',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const signature = style({
		color: 'content.primary',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const primary = style({ color: 'content.primary' })

	export const secondary = style({ color: 'content.secondary' })

	// Negative margins let the 32px IconButton sit in a 16px text row without
	// growing it. Only properties IconButton leaves unset.
	export const copyButton = style({
		flexShrink: '0 !custom',
		marginBlock: '-8px !custom',
		marginRight: '-8px !custom',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})

	export const section = style({
		minWidth: '0 !custom',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const argumentsLabel = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		gap: '8',
		marginBottom: '8',
		typography: 'body.b3',
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

	export const argumentGrid = style({
		display: 'grid',
		gridTemplateColumns: 'auto 1fr',
	})

	export const argumentRow = style({
		...copyRow,
		alignItems: 'start',
		display: 'grid',
		gap: '8',
		gridColumn: 'span 2 / span 2',
		gridTemplateColumns: 'subgrid',
		paddingBlock: '4',
	})

	export const argumentLabel = style({
		color: 'content.secondary',
		typography: 'body.b3',
		whiteSpace: 'pre',
	})

	export const hex = style({
		color: 'content.primary',
		minWidth: '0 !custom',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const label = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const inlineLabel = style({ marginBottom: '4' })

	export const sectionLabel = style({ marginBottom: '8' })

	export const dataButton = style({
		...copyRow,
		maxWidth: '100% !custom',
		minWidth: '0 !custom',
		paddingBlock: '2',
		width: '100% !custom',
	})

	export const data = style({
		color: 'content.primary',
		display: 'block',
		minWidth: '0 !custom',
		overflowWrap: 'anywhere',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const rawHeader = style({
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const divided = style({
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: 'regular',
				borderColor: 'line.secondary',
			},
		},
	})

	export const topicRow = style({
		...copyRow,
		alignItems: 'flex-start',
		display: 'flex',
		gap: '8',
		paddingBlock: '2',
	})

	export const topicLabel = style({
		color: 'content.secondary',
		flexShrink: '0 !custom',
		typography: 'body.b3',
	})
}
