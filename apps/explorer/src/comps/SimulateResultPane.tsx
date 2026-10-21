/**
 * The simulator's result pane, in reading order:
 *   1. the status, in the card header.
 *   2. the answer: the decoded error, the return value, or the primary event,
 *      as a callout. It is what the reader came for, so no tab hides it.
 *   3. headline metrics, compared with the on-chain transaction or the
 *      previous run when there is one.
 *   4. the evidence: Overview / Trace / State / Events / Gas, as tabs whose
 *      value lives in the URL. An empty tab is disabled rather than removed,
 *      so the layout does not rearrange itself between runs.
 */

import { Link } from '@tanstack/react-router'
import {
	Amount,
	Button,
	Callout,
	ChoiceGroup,
	formatHex,
	Gauge,
	Hex,
	Rows,
	style,
	Table,
	Tabs,
	Tag,
	Token,
} from '@tempoxyz/ds'
import type * as OxAddress from 'ox/Address'
import * as Value from 'ox/Value'
import * as React from 'react'
import type { Log } from 'viem'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { TxEventDescription } from '#comps/TxEventDescription'
import type { parseKnownEvents } from '#lib/domain/known-events'
import { preferredEventsFilter } from '#lib/domain/known-events'
import * as Tip20 from '#lib/domain/tip20'
import type { formatTraceErrorArgs } from '#lib/domain/trace-error-args'
import { formatDecodedTraceErrorShort } from '#lib/domain/trace-errors'
import type {
	SimulationAssetChange,
	SimulationCallResult,
	SimulationExecutionResult,
	SimulationInput,
} from '#lib/queries'
import { link, linkHover, truncate } from '#styles/explorer'
import {
	callLabel,
	formatGasPercent,
	gasPercent,
	PanelEmpty,
	signed,
} from './SimulateShared'
import type { TxTraceTree } from './TxTraceTree'

export type OutputTab = 'overview' | 'trace' | 'state' | 'events' | 'gas'

export type OriginalMetrics = {
	status: 'success' | 'reverted'
	gasUsed: bigint
	events: number
	balances: number
}

/* -------------------------------------------------------------------------- */
/* Status and metrics                                                         */
/* -------------------------------------------------------------------------- */

/** The run's state as one tag, for the card header. */
export function SimulateStatus(props: {
	execution: SimulationExecutionResult | undefined
}): React.JSX.Element {
	if (!props.execution)
		return (
			<Tag intent="info">
				<Tag.Dot />
				Simulating
			</Tag>
		)
	const succeeded = props.execution.status === 'success'
	return (
		<Tag intent={succeeded ? 'positive' : 'negative'}>
			<Tag.Dot />
			{succeeded ? 'Succeeded' : 'Failed'}
		</Tag>
	)
}

/**
 * Headline numbers as metric tiles. With a baseline, each tile states its
 * change in words, such as `−1,200 vs on-chain`.
 */
export function SimulateMetrics(
	props: SimulateMetrics.Props,
): React.JSX.Element {
	const { baseline } = props
	const against =
		baseline?.kind === 'on-chain' ? 'vs on-chain' : 'vs previous run'
	const change = (current: bigint, before: bigint | undefined) =>
		before === undefined
			? undefined
			: current === before
				? `No change ${against}`
				: `${signed(current - before)} ${against}`
	const statusChanged =
		baseline && baseline.metrics.status !== props.status
			? `${baseline.kind === 'on-chain' ? 'The on-chain transaction' : 'The previous run'} ${baseline.metrics.status === 'success' ? 'succeeded' : 'failed'}.`
			: undefined

	return (
		<div {...styles.metricsSection()}>
			<dl {...styles.metrics()}>
				<div {...styles.metric()}>
					<dt {...styles.metricLabel()}>Gas used</dt>
					<dd {...styles.metricValue()}>
						<Gauge
							aria-label="Gas used of the limit"
							max={Math.max(Number(props.gasLimit), 1)}
							size="small"
							value={Math.min(Number(props.gasUsed), Number(props.gasLimit))}
						/>
						<span>
							{props.gasUsed.toLocaleString()}
							<span {...styles.metricUnit()}>
								{' '}
								{formatGasPercent(gasPercent(props.gasUsed, props.gasLimit))}
							</span>
						</span>
					</dd>
					<dd {...styles.metricNote()}>
						{change(props.gasUsed, baseline?.metrics.gasUsed) ??
							`Limit ${props.gasLimit.toLocaleString()}`}
					</dd>
				</div>
				<div {...styles.metric()}>
					<dt {...styles.metricLabel()}>Events</dt>
					<dd {...styles.metricValue()}>{props.events.toLocaleString()}</dd>
					{baseline && (
						<dd {...styles.metricNote()}>
							{change(BigInt(props.events), BigInt(baseline.metrics.events))}
						</dd>
					)}
				</div>
				<div {...styles.metric()}>
					<dt {...styles.metricLabel()}>Balance changes</dt>
					<dd {...styles.metricValue()}>{props.balances.toLocaleString()}</dd>
					{baseline && (
						<dd {...styles.metricNote()}>
							{change(
								BigInt(props.balances),
								BigInt(baseline.metrics.balances),
							)}
						</dd>
					)}
				</div>
				<div {...styles.metric()}>
					<dt {...styles.metricLabel()}>Block</dt>
					<dd {...styles.metricValue()}>
						{props.blockNumber > 0n ? props.blockNumber.toLocaleString() : '—'}
					</dd>
					<dd {...styles.metricNote()}>{props.pinned ? 'Pinned' : 'Latest'}</dd>
				</div>
			</dl>
			{statusChanged && <p {...styles.metricNote()}>{statusChanged}</p>}
		</div>
	)
}

export declare namespace SimulateMetrics {
	interface Props {
		status: 'success' | 'reverted'
		gasUsed: bigint
		/** Gas available to everything in view; a batch's is per call × calls. */
		gasLimit: bigint
		events: number
		balances: number
		blockNumber: bigint
		pinned: boolean
		/** What the run is compared with, when there is something to compare. */
		baseline?:
			| { kind: 'on-chain' | 'previous'; metrics: OriginalMetrics }
			| undefined
	}
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Counts live in the labels, so the tab bar is also the summary. An empty tab
 * is disabled, not hidden, so the layout stays put between runs.
 *
 * Panels are passed as children so they sit inside the same `Tabs.Root`.
 */
export function SimulateTabs(props: SimulateTabs.Props): React.JSX.Element {
	return (
		<Tabs.Root
			value={props.value}
			onValueChange={(value) => {
				const tab = props.tabs.find((candidate) => candidate.id === value)
				if (tab) props.onChange(tab.id)
			}}
		>
			<Tabs.List activateOnFocus aria-label="Evidence" size="small">
				{props.tabs.map((tab) => (
					<Tabs.Tab
						key={tab.id}
						value={tab.id}
						disabled={tab.count === 0 && tab.id !== 'overview'}
					>
						{tab.label}
						{tab.count !== undefined && (
							<span {...styles.tabCount()}>{tab.count}</span>
						)}
					</Tabs.Tab>
				))}
				<Tabs.Indicator />
			</Tabs.List>
			{props.children}
		</Tabs.Root>
	)
}

export declare namespace SimulateTabs {
	interface Props {
		tabs: ReadonlyArray<{
			id: OutputTab
			label: string
			count?: number | undefined
		}>
		value: OutputTab
		onChange: (tab: OutputTab) => void
		/** `Tabs.Panel`s for the tabs above. */
		children?: React.ReactNode
	}
}

/* -------------------------------------------------------------------------- */
/* Answer                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The one thing the reader came for, as a callout beside the result.
 *
 * For a read call the return value is the answer. For a revert it is the
 * decoded error with named arguments. For a state change it is the
 * interpreted event.
 */
export function SimulateAnswer(props: SimulateAnswer.Props): React.JSX.Element {
	const { execution, tree, failedNode } = props

	if (execution.status !== 'success') {
		const failed = execution.calls.find((call) => call.status === 'reverted')
		return (
			<FailureAnswer
				position={
					failed && execution.calls.length > 1
						? `In call ${failed.index + 1} of ${execution.calls.length}, `
						: undefined
				}
				failedNode={failedNode}
				errorArgs={props.errorArgs}
				returnData={execution.returnData}
				onJump={props.onJumpToFrame}
			/>
		)
	}

	const events =
		execution.logs.length === 0
			? 'no events'
			: plural(execution.logs.length, 'event')

	if (execution.calls.length > 1)
		return (
			<Success>
				All {execution.calls.length} calls ran in order and emitted {events}
				{execution.assetChanges.length > 0 &&
					`, with ${plural(execution.assetChanges.length, 'balance change')}`}
				.
			</Success>
		)

	const event =
		props.knownEvents.find(preferredEventsFilter) ?? props.knownEvents[0]
	const call = tree ? callLabel(tree) : undefined
	const returned = tree?.decodedOutput

	// A read call's return value is the entire answer, so it leads.
	if (returned)
		return (
			<Success>
				<span {...styles.code()}>{call}</span> returned{' '}
				<span {...styles.code()}>{returned}</span>.
			</Success>
		)

	if (event)
		return (
			<Success>
				<TxEventDescription event={event} />
			</Success>
		)

	return (
		<Success>
			{call ? <span {...styles.code()}>{call}</span> : 'The call'} completed and
			emitted {events}.
		</Success>
	)
}

export declare namespace SimulateAnswer {
	interface Props {
		execution: SimulationExecutionResult
		tree: TxTraceTree.Node | null
		failedNode: TxTraceTree.Node | null
		errorArgs: ReturnType<typeof formatTraceErrorArgs>
		knownEvents: ReturnType<typeof parseKnownEvents>
		onJumpToFrame: (id: string) => void
	}
}

function plural(count: number, noun: string): string {
	return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`
}

function Success(props: { children: React.ReactNode }): React.JSX.Element {
	return (
		<Callout intent="positive">
			<Callout.Icon />
			{/* Return values run long, so the message wraps anywhere. */}
			<Callout.Content {...styles.calloutText()}>
				{props.children}
			</Callout.Content>
		</Callout>
	)
}

function FailureAnswer(props: {
	/** Which call of a batch failed, as the sentence's opening words. */
	position: string | undefined
	failedNode: TxTraceTree.Node | null
	errorArgs: ReturnType<typeof formatTraceErrorArgs>
	returnData: string
	onJump: (id: string) => void
}): React.JSX.Element {
	const { failedNode, errorArgs } = props
	const decoded = failedNode?.decodedError
	const call = failedNode ? callLabel(failedNode) : undefined
	const errorName =
		decoded && !decoded.undecoded
			? formatDecodedTraceErrorShort(decoded)
			: undefined
	const raw = decoded?.raw ?? props.returnData

	return (
		<div {...styles.failure()}>
			<Callout intent="negative">
				<Callout.Icon />
				{/* Revert data runs long, so the message wraps anywhere. */}
				<Callout.Content {...styles.calloutText()}>
					{props.position}
					{call ? (
						<span {...styles.code()}>{call}</span>
					) : props.position ? (
						'the call'
					) : (
						'The call'
					)}{' '}
					reverted
					{errorName ? (
						<>
							{' with '}
							<span {...styles.code()}>{errorName}</span>.
						</>
					) : raw && raw !== '0x' ? (
						<>
							{' with revert data that no known ABI decodes.'}
							<Hex.Root value={raw} {...styles.revertData()}>
								<Hex.Text />
								<Hex.Copy aria-label="Copy revert data" />
							</Hex.Root>
						</>
					) : (
						' and returned no revert data.'
					)}
				</Callout.Content>
				{failedNode?.hasFailure && failedNode.frameIndex > 0 && (
					<Callout.Action onClick={() => props.onJump(failedNode.id)}>
						Show in trace
					</Callout.Action>
				)}
			</Callout>

			{errorName && errorArgs.length > 0 && (
				<Rows.Root dividers="full" size="small">
					{errorArgs.map((arg) => (
						<Rows.Row key={arg.label} spacing="none">
							<Rows.Label>{arg.label}</Rows.Label>
							<span title={arg.title} {...styles.rowValue()}>
								<span {...styles.code()}>{arg.value}</span>
								{arg.note && <span {...styles.argNote()}>{arg.note}</span>}
							</span>
						</Rows.Row>
					))}
				</Rows.Root>
			)}
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Batch controls                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Which call of a batch every tab below shows. All calls is the default,
 * because a batch is one transaction; picking a call narrows the evidence.
 */
export function SimulateStepBar(props: {
	calls: readonly SimulationCallResult[]
	/** Decoded call names, indexed by call. */
	labels: readonly string[]
	/** `undefined` is the default: every call at once. */
	step: number | undefined
	onSelect: (index: number | undefined) => void
}): React.JSX.Element {
	const labelId = React.useId()
	const failed = props.calls.filter((call) => call.status === 'reverted').length
	return (
		<div {...styles.stepBar()}>
			<span id={labelId} {...styles.stepLabel()}>
				Showing
			</span>
			<ChoiceGroup.Root
				aria-labelledby={labelId}
				onValueChange={(value) =>
					props.onSelect(value === 'all' ? undefined : Number(value))
				}
				size="small"
				value={props.step === undefined ? 'all' : String(props.step)}
				variant="chips"
				{...styles.chips()}
			>
				<ChoiceGroup.Item value="all">
					All {props.calls.length}
					{failed > 0 && `, ${failed} failed`}
				</ChoiceGroup.Item>
				{props.calls.map((call) => (
					<ChoiceGroup.Item key={call.index} value={String(call.index)}>
						{call.index + 1}. {props.labels[call.index] ?? 'call()'}
						{call.status === 'reverted' && ', failed'}
					</ChoiceGroup.Item>
				))}
			</ChoiceGroup.Root>
		</div>
	)
}

/**
 * A call's heading above its own trace, when every call of a batch shows at
 * once. The batch stays visibly N calls rather than being stitched into one
 * synthetic tree.
 */
export function SimulateCallHeading(props: {
	call: SimulationCallResult
	/** Decoded name, taken from the already-built trace for this call. */
	label: string
	total: number
	onIsolate: () => void
}): React.JSX.Element {
	const { call, label } = props
	const failed = call.status === 'reverted'

	return (
		<div {...styles.callHeading()}>
			<h3 {...styles.callTitle()}>
				Call {call.index + 1} of {props.total}
			</h3>
			<Tag
				intent={failed ? 'negative' : 'positive'}
				size="small"
				{...styles.shrink()}
			>
				<Tag.Dot />
				{failed ? 'Failed' : 'Succeeded'}
			</Tag>
			<span {...cx(styles.code(), styles.primary(), truncate())}>{label}</span>
			<span {...cx(styles.number(), styles.secondary(), styles.pushRight())}>
				{call.gasUsed.toLocaleString()} gas
			</span>
			<Button
				size="small"
				variant="text"
				onClick={props.onIsolate}
				{...styles.shrink()}
			>
				Show only this call
			</Button>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Panels                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What ran, as the details of one record, then the balance changes. These are
 * the facts to check when a result surprises you.
 */
export function SimulateOverview(props: {
	input: SimulationInput
	execution: SimulationExecutionResult
	functionLabel: string | undefined
	network: string
	assetChanges: readonly SimulationAssetChange[]
	tokenMetadata: Record<string, { symbol?: string; decimals?: number }>
}): React.JSX.Element {
	const { input, execution } = props
	const balancesId = React.useId()
	return (
		<div {...styles.column()}>
			<Rows.Root dividers="full" size="small">
				<Rows.Row>
					<Rows.Label>From</Rows.Label>
					<span {...styles.address()}>
						<Address address={input.from} align="end" />
					</span>
				</Rows.Row>
				<Rows.Row>
					<Rows.Label>To</Rows.Label>
					<span {...styles.address()}>
						<Address address={input.to} align="end" />
					</span>
				</Rows.Row>
				<Rows.Row>
					<Rows.Label>Function</Rows.Label>
					{props.functionLabel ? (
						<span {...cx(styles.code(), styles.rowValue())}>
							{props.functionLabel}
						</span>
					) : (
						<span {...styles.secondary()}>Unknown selector</span>
					)}
				</Rows.Row>
				<Rows.Row>
					<Rows.Label>Value</Rows.Label>
					<span {...styles.number()}>{input.value}</span>
				</Rows.Row>
				<Rows.Row>
					<Rows.Label>Block</Rows.Label>
					<span {...styles.number()}>
						{execution.blockNumber.toLocaleString()}
						<span {...styles.secondary()}>
							{input.block === 'latest' ? ' (latest)' : ' (pinned)'}
						</span>
					</span>
				</Rows.Row>
				<Rows.Row>
					<Rows.Label>Network</Rows.Label>
					{props.network}
				</Rows.Row>
				{props.assetChanges.length === 0 && (
					<Rows.Row>
						<Rows.Label>Balance changes</Rows.Label>
						<span {...styles.secondary()}>None</span>
					</Rows.Row>
				)}
			</Rows.Root>
			{props.assetChanges.length > 0 && (
				<section aria-labelledby={balancesId}>
					<h3 id={balancesId} {...styles.sectionTitle()}>
						Balance changes
					</h3>
					<SimulateBalances
						assetChanges={props.assetChanges}
						tokenMetadata={props.tokenMetadata}
					/>
				</section>
			)}
		</div>
	)
}

/**
 * Net token movement per account. Grouped by account because "what happened
 * to me" is the question; the account cell spans its rows.
 */
export function SimulateBalances(props: {
	assetChanges: readonly SimulationAssetChange[]
	tokenMetadata: Record<string, { symbol?: string; decimals?: number }>
}): React.JSX.Element {
	const byAccount = new Map<OxAddress.Address, SimulationAssetChange[]>()
	for (const change of props.assetChanges) {
		const existing = byAccount.get(change.address)
		if (existing) existing.push(change)
		else byAccount.set(change.address, [change])
	}

	return (
		<Table.Root aria-label="Balance changes" size="small" {...styles.table()}>
			<Table.Head>
				<Table.Row>
					<Table.HeaderCell>Account</Table.HeaderCell>
					<Table.HeaderCell>Token</Table.HeaderCell>
					<Table.HeaderCell justify="end">Change</Table.HeaderCell>
				</Table.Row>
			</Table.Head>
			<Table.Body>
				{[...byAccount.entries()].flatMap(([account, changes]) =>
					changes.map((change, index) => {
						const metadata =
							props.tokenMetadata[change.token] ??
							props.tokenMetadata[change.token.toLowerCase()]
						return (
							<Table.Row key={`${account}-${change.token}`}>
								{index === 0 && (
									<Table.Cell rowSpan={changes.length}>
										<Address address={account} />
									</Table.Cell>
								)}
								<Table.Cell>
									<Link
										to={
											Tip20.isTip20Address(change.token)
												? '/token/$address'
												: '/address/$address'
										}
										params={{ address: change.token }}
										title={change.token}
										{...cx(styles.token(), link(), linkHover())}
									>
										<Token address={change.token} size="small" />
										{metadata?.symbol ?? formatHex(change.token)}
									</Link>
								</Table.Cell>
								<Table.Cell
									justify="end"
									numeric
									title={`${change.diff.toString()} in base units`}
								>
									<BalanceChange
										diff={change.diff}
										decimals={metadata?.decimals}
										symbol={metadata?.symbol}
									/>
								</Table.Cell>
							</Table.Row>
						)
					}),
				)}
			</Table.Body>
		</Table.Root>
	)
}

/**
 * A signed balance change in the token's units. Without decimals it stays in
 * base units, since a guessed scale reads as a wrong amount.
 */
function BalanceChange(props: {
	diff: bigint
	decimals: number | undefined
	symbol: string | undefined
}): React.JSX.Element {
	const magnitude = props.diff < 0n ? -props.diff : props.diff
	return (
		<Amount
			align="right"
			sign={props.diff > 0n ? '+' : props.diff < 0n ? '−' : undefined}
			symbol={props.decimals === undefined ? undefined : props.symbol}
			value={
				props.decimals === undefined
					? magnitude.toString()
					: Value.format(magnitude, props.decimals)
			}
		/>
	)
}

export function SimulateEvents(props: {
	logs: readonly Log[]
	knownEvents: ReturnType<typeof parseKnownEvents>
}): React.JSX.Element {
	if (props.logs.length === 0)
		return (
			<PanelEmpty
				title="No events"
				description="This call emitted no events."
			/>
		)
	if (props.knownEvents.length === 0)
		return (
			<PanelEmpty
				title="No recognized events"
				description={`This call emitted ${plural(props.logs.length, 'event')}, and none match a known event.`}
			/>
		)

	return (
		<ol {...styles.events()}>
			{props.knownEvents.map((event, index) => (
				<li key={`${event.type}-${index}`} {...styles.event()}>
					<span {...styles.eventIndex()}>{index + 1}</span>
					<TxEventDescription event={event} />
				</li>
			))}
		</ol>
	)
}

namespace styles {
	export const primary = style({ color: 'foreground' })

	export const secondary = style({ color: 'gray.900' })

	export const number = style({ fontVariantNumeric: 'tabular-nums' })

	export const code = style({ typography: 'label.13.mono' })

	export const shrink = style({ flexShrink: 0 })

	export const pushRight = style({ marginLeft: 'auto !custom' })

	export const column = style({ display: 'flex', flexDirection: 'column' })

	export const metricsSection = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingBlock: '20',
	})

	// The Dashboards pattern's metric tiles: a label, a value, and a note.
	export const metrics = style({
		columnGap: '24',
		display: 'grid',
		gridTemplateColumns: 'repeat(auto-fit, minmax(7.5rem, 1fr)) !custom',
		margin: '0',
		rowGap: '16',
	})

	export const metric = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0 !custom',
	})

	export const metricLabel = style({
		color: 'gray.900',
		typography: 'label.13',
	})

	export const metricValue = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'flex',
		fontVariantNumeric: 'tabular-nums !custom',
		gap: '8',
		margin: '0',
		minHeight: '32',
		typography: 'heading.20',
	})

	export const metricUnit = style({ color: 'gray.900', typography: 'label.14' })

	export const metricNote = style({
		color: 'gray.900',
		fontVariantNumeric: 'tabular-nums !custom',
		margin: '0',
		typography: 'label.12',
	})

	export const tabCount = style({
		color: 'gray.900',
		fontVariantNumeric: 'tabular-nums',
		marginLeft: '4',
	})

	export const failure = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
	})

	export const calloutText = style({ overflowWrap: 'anywhere' })

	// Revert data takes its own line, truncated in the middle to fit.
	export const revertData = style({ display: 'flex', marginTop: '4' })

	// The value side of a key-value row: it takes the free width and sits at
	// the end, wrapping rather than overflowing.
	export const rowValue = style({
		minWidth: '0 !custom',
		overflowWrap: 'anywhere',
		textAlign: 'end',
	})

	export const argNote = style({ color: 'gray.900', marginLeft: '8' })

	// Rows guidance: cap an address so it ends with the other values.
	export const address = style({
		display: 'flex',
		justifyContent: 'flex-end',
		maxWidth: '160',
		minWidth: '0 !custom',
	})

	export const sectionTitle = style({
		color: 'foreground',
		margin: '0',
		paddingBottom: '8',
		paddingInline: '16',
		paddingTop: '24',
		typography: 'heading.16',
	})

	export const stepBar = style({
		alignItems: 'center',
		display: 'flex',
		gap: '12',
		paddingBottom: '16',
	})

	export const stepLabel = style({
		color: 'foreground',
		flexShrink: 0,
		typography: 'label.13.strong',
	})

	export const chips = style({ minWidth: '0 !custom' })

	export const callHeading = style({
		alignItems: 'center',
		backgroundColor: 'grayAlpha.100',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '16',
		typography: 'copy.14',
	})

	export const callTitle = style({
		color: 'foreground',
		flexShrink: 0,
		margin: '0',
		typography: 'label.14.strong',
	})

	// Fixed columns, so long values wrap instead of widening the table.
	export const table = style({
		overflowWrap: 'anywhere',
		tableLayout: 'fixed',
	})

	export const token = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
	})

	export const events = style({
		display: 'flex',
		flexDirection: 'column',
		listStyle: 'none',
		margin: '0',
		padding: '0',
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: '1px',
				borderColor: 'grayAlpha.200',
				borderStyle: 'solid',
			},
		},
	})

	export const event = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '16',
		typography: 'copy.14',
	})

	export const eventIndex = style({
		color: 'gray.900',
		flexShrink: 0,
		fontVariantNumeric: 'tabular-nums',
		typography: 'label.13',
	})
}
