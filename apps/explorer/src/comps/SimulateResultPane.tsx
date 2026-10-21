/**
 * The simulator's output pane.
 *
 * Three layers, in reading order:
 *   1. the header — status, gas against its limit, block. Sticky, one line.
 *   2. the answer — the decoded error, the return value, or the primary event.
 *      This is the thing the user came for and it is never behind a tab.
 *   3. the evidence — Trace / State / Events / Gas, as tabs whose index lives in
 *      the URL. Tabs are disabled when empty rather than removed, so the layout
 *      does not rearrange itself between runs.
 */

import { Link } from '@tanstack/react-router'
import {
	Button,
	Callout,
	Rows,
	Spinner,
	Table,
	Tabs,
	style,
	variants,
	vars,
} from '@tempoxyz/ds'
import { AlertCircle, Check, ChevronRight } from '@tempoxyz/ds/icons'
import type * as OxAddress from 'ox/Address'
import type * as React from 'react'
import type { Log } from 'viem'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { TokenIcon } from '#comps/TokenIcon'
import { TxEventDescription } from '#comps/TxEventDescription'
import { LiveIndicator } from '#comps/ui/LiveIndicator'
import type { parseKnownEvents } from '#lib/domain/known-events'
import { preferredEventsFilter } from '#lib/domain/known-events'
import * as Tip20 from '#lib/domain/tip20'
import type { formatTraceErrorArgs } from '#lib/domain/trace-error-args'
import { formatDecodedTraceErrorShort } from '#lib/domain/trace-errors'
import { HexFormatter } from '#lib/formatting'
import type {
	SimulationAssetChange,
	SimulationCallResult,
	SimulationExecutionResult,
	SimulationInput,
} from '#lib/queries'
import {
	link,
	linkHover,
	mono,
	noScrollbar,
	pressDown,
	srOnly,
	textAction,
	truncate,
} from '#styles/explorer'
import type { TxTraceTree } from './TxTraceTree'
import {
	callLabel,
	formatBalanceDelta,
	GasRatio,
	PanelEmpty,
	signed,
} from './SimulateShared'

export type OutputTab = 'overview' | 'trace' | 'state' | 'events' | 'gas'

export type OriginalMetrics = {
	status: 'success' | 'reverted'
	gasUsed: bigint
	events: number
	balances: number
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Status, gas, and block on one line, with the actions.
 *
 * This replaces a 120px-tall card whose only job was to hold a check mark. The
 * gas figure is `used / limit (percent)`: a bare "273,270 gas" answers nothing,
 * and the ratio is the one number that tells you whether the call is close to
 * running out.
 */
export function SimulateResultHeader(
	props: SimulateResultHeader.Props,
): React.JSX.Element {
	const { execution, input } = props
	const succeeded = execution?.status === 'success'
	const limit = props.gasLimit

	return (
		<div {...styles.header()}>
			{execution ? (
				<span {...styles.verdict()}>
					<span
						{...styles.verdictIcon({
							tone: succeeded ? 'positive' : 'negative',
						})}
					>
						{succeeded ? <Check /> : <AlertCircle />}
					</span>
					{verdictHeadline(execution)}
				</span>
			) : (
				<span {...cx(styles.verdict(), styles.secondary())}>
					<Spinner />
					Simulating…
				</span>
			)}

			{props.stale && (
				<LiveIndicator tone="warning">Inputs changed</LiveIndicator>
			)}

			{execution && (
				<>
					{/* Same shape as the transaction page's Gas Used row, rendered by
					    the one component the Gas tab's meter also uses. */}
					<span {...cx(styles.shrink(), styles.data())}>
						<span {...styles.secondary()}>gas </span>
						<GasRatio used={execution.gasUsed} limit={limit} />
					</span>

					<span {...cx(styles.shrink(), styles.data())}>
						<span {...styles.secondary()}>
							{input.block === 'latest' ? 'after ' : 'after block '}
						</span>
						<span {...styles.primary()}>
							{execution.blockNumber > 0n
								? execution.blockNumber.toLocaleString()
								: '—'}
						</span>
					</span>

					<span {...cx(styles.shrink(), styles.text(), styles.secondary())}>
						{networkName(input.chainId)}
					</span>
				</>
			)}
		</div>
	)
}

export declare namespace SimulateResultHeader {
	interface Props {
		execution: SimulationExecutionResult | undefined
		input: SimulationInput
		/** Gas available to everything in view; a batch's is per call × calls. */
		gasLimit: bigint
		stale: boolean
	}
}

function verdictHeadline(execution: SimulationExecutionResult): string {
	if (execution.calls.length <= 1)
		return execution.status === 'success' ? 'Succeeded' : 'Reverted'
	const failed = execution.calls.find((call) => call.status === 'reverted')
	if (!failed) return `All ${execution.calls.length} calls succeeded`
	return `Reverted in call ${failed.index + 1} of ${execution.calls.length}`
}

function networkName(chainId: number): string {
	if (chainId === 4217) return 'mainnet'
	if (chainId === 42431) return 'moderato'
	return 'devnet'
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Counts live in the label so the tab bar is also the summary. An empty tab is
 * disabled, not hidden: sections that come and go between runs make the layout
 * jump and stop anyone learning where things are.
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
			{/* The bar carries the divider; the TDS list inside is its own track. */}
			<div {...styles.tabs()}>
				<Tabs.List
					activateOnFocus
					aria-label="Result"
					size="small"
					{...noScrollbar()}
				>
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
			</div>
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
 * The one thing the user came for, above the evidence and never behind a tab.
 *
 * For a read call the return value *is* the answer. For a revert it is the
 * decoded error with named arguments. For a state change it is the interpreted
 * event.
 */
export function SimulateAnswer(props: SimulateAnswer.Props): React.JSX.Element {
	const { execution, tree, failedNode } = props
	const succeeded = execution.status === 'success'

	if (!succeeded)
		return (
			<FailureAnswer
				failedNode={failedNode}
				errorArgs={props.errorArgs}
				returnData={execution.returnData}
				onJump={props.onJumpToFrame}
			/>
		)

	if (execution.calls.length > 1)
		return (
			<AnswerShell>
				<p {...cx(styles.answerText(), styles.secondary())}>
					{execution.calls.length} calls ran in order · {execution.logs.length}{' '}
					event
					{execution.logs.length === 1 ? '' : 's'}
					{execution.assetChanges.length > 0 &&
						` · ${execution.assetChanges.length} balance change${execution.assetChanges.length === 1 ? '' : 's'}`}
				</p>
			</AnswerShell>
		)

	const event =
		props.knownEvents.find(preferredEventsFilter) ?? props.knownEvents[0]
	const call = tree ? callLabel(tree) : undefined
	const returned = tree?.decodedOutput

	// A read call's return value is the entire answer — lead with it.
	if (returned)
		return (
			<AnswerShell>
				<p {...cx(styles.answerText(), styles.secondary())}>
					<span {...styles.code()}>{call}</span> returned{' '}
					<span {...cx(styles.code(), styles.primary())}>{returned}</span>
				</p>
			</AnswerShell>
		)

	if (event)
		return (
			<AnswerShell>
				<div {...cx(styles.answerText(), styles.secondary())}>
					<TxEventDescription event={event} />
				</div>
			</AnswerShell>
		)

	return (
		<AnswerShell>
			<p {...cx(styles.answerText(), styles.secondary())}>
				{call && (
					<>
						<span {...styles.code()}>{call}</span> completed.{' '}
					</>
				)}
				{execution.logs.length === 0
					? 'No events emitted.'
					: `${execution.logs.length} event${execution.logs.length === 1 ? '' : 's'} emitted.`}
			</p>
		</AnswerShell>
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

function AnswerShell(props: { children: React.ReactNode }): React.JSX.Element {
	return <div {...styles.answer()}>{props.children}</div>
}

function FailureAnswer(props: {
	failedNode: TxTraceTree.Node | null
	errorArgs: ReturnType<typeof formatTraceErrorArgs>
	returnData: string
	onJump: (id: string) => void
}): React.JSX.Element {
	const { failedNode, errorArgs } = props
	const decoded = failedNode?.decodedError
	const call = failedNode ? callLabel(failedNode) : undefined
	const errorName = decoded
		? decoded.undecoded
			? undefined
			: formatDecodedTraceErrorShort(decoded)
		: undefined
	const raw = decoded?.raw ?? props.returnData

	return (
		<div {...styles.failure()}>
			<Callout intent="negative">
				<Callout.Icon />
				<Callout.Content>
					<strong {...styles.calloutTitle()}>
						{call ? (
							<>
								<span {...mono()}>{call}</span> reverted
							</>
						) : (
							'Reverted'
						)}
					</strong>
					<span {...styles.calloutText()}>
						{errorName ? (
							<span {...mono()}>{errorName}</span>
						) : raw && raw !== '0x' ? (
							<span {...mono()}>{raw}</span>
						) : (
							'No revert data returned.'
						)}
					</span>
				</Callout.Content>
			</Callout>

			{errorName && errorArgs.length > 0 && (
				<Rows dividers="full">
					{errorArgs.map((arg) => (
						<Rows.Row key={arg.label} spacing="none">
							<Rows.Label>{arg.label}</Rows.Label>
							<span title={arg.title} {...styles.rowValue()}>
								<span {...mono()}>{arg.value}</span>
								{arg.note && <span {...styles.errorArgNote()}>{arg.note}</span>}
							</span>
						</Rows.Row>
					))}
				</Rows>
			)}

			{failedNode?.hasFailure && failedNode.frameIndex > 0 && (
				<button
					type="button"
					onClick={() => props.onJump(failedNode.id)}
					{...cx(textAction(), styles.jump())}
				>
					Show {call ?? 'the failing frame'} in the trace
					<ChevronRight />
				</button>
			)}
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Panels                                                                     */
/* -------------------------------------------------------------------------- */

/** `vs. on-chain` / `vs. previous run` beside the answer. */
export function SimulateDiff(props: {
	label: string
	original: OriginalMetrics
	execution: SimulationExecutionResult
}): React.JSX.Element | null {
	const gasDiff = props.execution.gasUsed - props.original.gasUsed
	const eventDiff = props.execution.logs.length - props.original.events
	const balanceDiff =
		props.execution.assetChanges.length - props.original.balances
	const statusChanged = props.execution.status !== props.original.status
	if (!statusChanged && gasDiff === 0n && eventDiff === 0 && balanceDiff === 0)
		return (
			<div {...styles.diff()}>
				<span {...styles.secondary()}>{props.label}</span>
				<LiveIndicator tone="neutral">no change</LiveIndicator>
			</div>
		)

	return (
		<div {...styles.diff()}>
			<span {...styles.secondary()}>{props.label}</span>
			{statusChanged && (
				<LiveIndicator tone="negative">
					{props.original.status} → {props.execution.status}
				</LiveIndicator>
			)}
			{gasDiff !== 0n && (
				<LiveIndicator tone={gasDiff < 0n ? 'positive' : 'neutral'}>
					gas {signed(gasDiff)}
				</LiveIndicator>
			)}
			{eventDiff !== 0 && (
				<LiveIndicator tone="neutral">
					events {signed(BigInt(eventDiff))}
				</LiveIndicator>
			)}
			{balanceDiff !== 0 && (
				<LiveIndicator tone="neutral">
					balances {signed(BigInt(balanceDiff))}
				</LiveIndicator>
			)}
		</div>
	)
}

/**
 * What was actually run, as a fact list.
 *
 * Overview used to hold only balance changes, so a reverting call with no
 * transfers landed on an empty default tab. These are the facts you check when
 * a result surprises you — "did it run what I think it ran" — and they belong
 * in front of the evidence, not behind it.
 */
export function SimulateOverview(props: {
	input: SimulationInput
	execution: SimulationExecutionResult
	/** Same allowance the header uses, so the two never disagree. */
	gasLimit: bigint
	functionLabel: string | undefined
	assetChanges: readonly SimulationAssetChange[]
	tokenMetadata: Record<string, { symbol?: string; decimals?: number }>
}): React.JSX.Element {
	const { input, execution } = props
	const limit = props.gasLimit
	return (
		<div {...styles.column()}>
			{/* Two columns from 720px. The grid is a local wrapper inside Rows, so
			    the rows keep their TDS look and every row draws its divider. */}
			<Rows dividers="full">
				<div {...styles.facts()}>
					<Fact label="From">
						<Address address={input.from} align="end" />
					</Fact>
					<Fact label="Function">
						{props.functionLabel ?? (
							<span {...styles.secondary()}>unknown selector</span>
						)}
					</Fact>
					<Fact label="To">
						<Address address={input.to} align="end" />
					</Fact>
					<Fact label="Value">
						{input.value === '0' ? (
							<span {...styles.secondary()}>0</span>
						) : (
							input.value
						)}
					</Fact>
					<Fact label="Gas used">
						{execution.gasUsed.toLocaleString()}
						<span {...styles.secondary()}>
							{' / '}
							{limit.toLocaleString()}
						</span>
					</Fact>
					<Fact label="Block">
						{execution.blockNumber.toLocaleString()}
						<span {...styles.secondary()}>
							{input.block === 'latest' ? ' latest' : ' pinned'}
						</span>
					</Fact>
				</div>
			</Rows>
			<div {...styles.section()}>
				<span {...styles.sectionTitle()}>Balance changes</span>
				<span {...cx(styles.data(), styles.secondary())}>
					{props.assetChanges.length}
				</span>
			</div>
			<SimulateBalances
				assetChanges={props.assetChanges}
				tokenMetadata={props.tokenMetadata}
			/>
		</div>
	)
}

function Fact(props: {
	label: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<Rows.Row spacing="none">
			<Rows.Label>{props.label}</Rows.Label>
			<span {...cx(styles.rowValue(), styles.factValue())}>
				{props.children}
			</span>
		</Rows.Row>
	)
}

/**
 * Which call of a batch every tab below is showing.
 *
 * Each button names its call's function and carries its outcome, and the
 * selected one is filled. Selecting one filters the whole pane.
 */
export function SimulateStepBar(props: {
	calls: readonly SimulationCallResult[]
	/** Decoded call names, indexed by call. */
	labels: readonly string[]
	/** `undefined` is the default: every call at once. */
	step: number | undefined
	onSelect: (index: number | undefined) => void
}): React.JSX.Element {
	const failed = props.calls.filter((call) => call.status === 'reverted').length
	return (
		// biome-ignore lint/a11y/useSemanticElements: a row of toggle buttons, not a form fieldset
		<div role="group" aria-label="Calls shown" {...styles.diff()}>
			<span {...cx(styles.shrink(), styles.secondary())}>Showing</span>
			{/* A batch is one transaction, so seeing all of it is the default; the
			    per-call buttons narrow the evidence rather than switching between
			    unrelated views. */}
			<Button
				size="small"
				variant={props.step === undefined ? 'secondary' : 'text'}
				aria-pressed={props.step === undefined}
				onClick={() => props.onSelect(undefined)}
			>
				All {props.calls.length}
				{failed > 0 && (
					<LiveIndicator tone="negative">{failed} failed</LiveIndicator>
				)}
			</Button>
			<span aria-hidden {...cx(styles.shrink(), styles.tertiary())}>
				·
			</span>
			{props.calls.map((call) => (
				<StepChip
					key={call.index}
					call={call}
					label={props.labels[call.index] ?? 'call()'}
					selected={call.index === props.step}
					onSelect={() => props.onSelect(call.index)}
				/>
			))}
		</div>
	)
}

/**
 * A call's heading above its own trace, when every call is shown at once.
 *
 * The batch stays visibly N calls rather than being stitched into one synthetic
 * tree: which call you are looking at is never in question, and no gas total or
 * target address has to be invented for a root frame that does not exist.
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
			<LiveIndicator tone={failed ? 'negative' : 'positive'}>
				Call {call.index + 1} of {props.total}
				<span {...srOnly()}>{failed ? ', reverted' : ', succeeded'}</span>
			</LiveIndicator>
			<span
				{...cx(styles.data(), styles.primary(), truncate(), styles.minWidth())}
			>
				{label}
			</span>
			<span
				{...cx(
					styles.shrink(),
					styles.data(),
					styles.secondary(),
					styles.pushRight(),
				)}
			>
				{call.gasUsed.toLocaleString()} gas
			</span>
			<button
				type="button"
				onClick={props.onIsolate}
				{...cx(textAction(), styles.shrink())}
			>
				Isolate
				<ChevronRight />
			</button>
		</div>
	)
}

function StepChip(props: {
	call: SimulationCallResult
	label: string
	selected: boolean
	onSelect: () => void
}): React.JSX.Element {
	const { call, label, selected } = props
	const failed = call.status === 'reverted'

	return (
		<Button
			size="small"
			variant={selected ? 'secondary' : 'text'}
			aria-pressed={selected}
			onClick={props.onSelect}
		>
			<LiveIndicator tone={failed ? 'negative' : 'positive'}>
				{call.index + 1}
				<span {...srOnly()}>{failed ? ', reverted' : ', succeeded'}</span>
			</LiveIndicator>
			<span {...styles.code()}>{label}</span>
		</Button>
	)
}

/**
 * Net token movement per account.
 *
 * Grouped by account because "what happened to me" is the question. The account
 * cell spans its rows rather than repeating, so the group reads as one block.
 */
export function SimulateBalances(props: {
	assetChanges: readonly SimulationAssetChange[]
	tokenMetadata: Record<string, { symbol?: string; decimals?: number }>
}): React.JSX.Element {
	if (props.assetChanges.length === 0)
		return <PanelEmpty>No balance changes.</PanelEmpty>

	const byAccount = new Map<OxAddress.Address, SimulationAssetChange[]>()
	for (const change of props.assetChanges) {
		const existing = byAccount.get(change.address)
		if (existing) existing.push(change)
		else byAccount.set(change.address, [change])
	}

	return (
		<div {...styles.tableWrap()}>
			<Table size="small" {...styles.table()}>
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
											{...cx(styles.token(), link(), linkHover(), pressDown())}
										>
											<TokenIcon address={change.token} />
											{metadata?.symbol ?? (
												<span {...styles.code()}>
													{HexFormatter.truncate(change.token)}
												</span>
											)}
										</Link>
									</Table.Cell>
									<Table.Cell
										justify="end"
										numeric
										title={`${change.diff.toString()} (raw)`}
									>
										{formatBalanceDelta(change.diff, metadata?.decimals)}
									</Table.Cell>
								</Table.Row>
							)
						}),
					)}
				</Table.Body>
			</Table>
		</div>
	)
}

export function SimulateEvents(props: {
	logs: readonly Log[]
	knownEvents: ReturnType<typeof parseKnownEvents>
}): React.JSX.Element {
	if (props.logs.length === 0)
		return <PanelEmpty>No events emitted.</PanelEmpty>
	if (props.knownEvents.length === 0)
		return (
			<PanelEmpty>
				{props.logs.length} raw event{props.logs.length === 1 ? '' : 's'}{' '}
				emitted, none recognised.
			</PanelEmpty>
		)

	return (
		<div {...styles.events()}>
			{props.knownEvents.map((event, index) => (
				<div key={`${event.type}-${index}`} {...styles.event()}>
					<span {...styles.eventIndex()}>{index + 1}</span>
					<TxEventDescription event={event} />
				</div>
			))}
		</div>
	)
}

namespace styles {
	export const primary = style({ color: 'foreground' })

	export const secondary = style({ color: 'gray.900' })

	export const tertiary = style({ color: 'gray.700' })

	export const text = style({ typography: 'copy.14' })

	export const data = style({
		fontVariantNumeric: 'tabular-nums',
		typography: 'copy.14',
	})

	export const code = style({ typography: 'label.12.mono' })

	export const shrink = style({ flexShrink: 0 })

	export const minWidth = style({ minWidth: '0 !custom' })

	export const pushRight = style({ marginLeft: 'auto !custom' })

	export const column = style({ display: 'flex', flexDirection: 'column' })

	export const header = style({
		alignItems: 'center',
		backdropFilter: 'blur(8px)',
		backgroundColor: `color-mix(in oklab, ${vars.color.background.surface} 95%, transparent) !custom`,
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		columnGap: '16',
		display: 'flex',
		flexWrap: 'wrap',
		paddingBlock: '12',
		paddingInline: '16',
		position: 'sticky',
		rowGap: '8',
		top: '0',
		zIndex: 10,
	})

	export const verdict = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'flex',
		flexShrink: 0,
		gap: '8',
		typography: 'copy.14.strong',
	})

	export const verdictIcon = variants({
		base: {
			alignItems: 'center',
			borderRadius: 'full',
			display: 'flex',
			height: '20',
			justifyContent: 'center',
			typography: 'label.12',
			width: '20',
		},
		defaultVariants: { tone: 'positive' },
		variants: {
			tone: {
				negative: {
					backgroundColor: 'red.100',
					color: 'red.900',
				},
				positive: {
					backgroundColor: 'green.100',
					color: 'green.900',
				},
			},
		},
	})

	export const tabs = style({
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		paddingBlock: '8',
		paddingInline: '16',
	})

	export const tabCount = style({ fontVariantNumeric: 'tabular-nums' })

	export const answer = style({ paddingBlock: '12', paddingInline: '16' })

	export const answerText = style({ margin: '0', typography: 'label.12' })

	export const failure = style({
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		paddingBlock: '12',
		paddingInline: '16',
	})

	export const calloutTitle = style({
		display: 'block',
		typography: 'copy.14.strong',
	})

	// Revert data runs long; let it wrap inside the callout.
	export const calloutText = style({
		display: 'block',
		overflowWrap: 'anywhere',
	})

	// The value side of a `Rows` key-value row: it takes the free width and
	// sits at the end, wrapping rather than overflowing.
	export const rowValue = style({
		flex: 1,
		minWidth: '0 !custom',
		overflowWrap: 'anywhere',
		textAlign: 'end',
	})

	export const errorArgNote = style({
		color: 'gray.900',
		marginLeft: '8',
	})

	// The action is inline; keep it from stretching in the column.
	export const jump = style({ alignSelf: 'flex-start' })

	export const diff = style({
		alignItems: 'center',
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '16',
		typography: 'copy.14',
	})

	export const facts = style({
		columnGap: '32',
		paddingInline: '16',
		'@media (width >= 720px)': {
			display: 'grid',
			gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
		},
	})

	export const factValue = style({ fontVariantNumeric: 'tabular-nums' })

	export const section = style({
		alignItems: 'center',
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		borderTopWidth: '1px',
		display: 'flex',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '16',
	})

	export const sectionTitle = style({
		color: 'foreground',
		typography: 'copy.14.strong',
	})

	export const callHeading = style({
		alignItems: 'center',
		backgroundColor: 'grayAlpha.100',
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '16',
	})

	// TDS cells pad their own sides, so the wrap pads only the block and
	// scrolls sideways.
	export const tableWrap = style({ overflowX: 'auto', paddingBlock: '16' })

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
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: '1px',
				borderColor: 'grayAlpha.200',
				borderStyle: 'solid',
			},
		},
	})

	export const event = style({
		alignItems: 'flex-start',
		display: 'flex',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '16',
		typography: 'label.12',
	})

	export const eventIndex = style({
		color: 'gray.900',
		flexShrink: 0,
		fontVariantNumeric: 'tabular-nums',
		marginTop: '2px !custom',
		typography: 'label.12',
	})
}
