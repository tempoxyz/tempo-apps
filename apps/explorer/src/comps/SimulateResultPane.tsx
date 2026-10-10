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
import { style, variants, vars } from '@tempoxyz/ds/platform'
import type * as OxAddress from 'ox/Address'
import * as React from 'react'
import type { Log } from 'viem'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { TokenIcon } from '#comps/TokenIcon'
import { TxEventDescription } from '#comps/TxEventDescription'
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
	noScrollbar,
	pressDown,
	spin,
	transitionColors,
	truncate,
} from '#styles/explorer'
import type { TxTraceTree } from './TxTraceTree'
import {
	callLabel,
	Chip,
	Fact,
	formatBalanceDelta,
	GasRatio,
	PanelEmpty,
	signed,
} from './SimulateShared'
import ArrowRightIcon from '~icons/lucide/arrow-right'
import CheckIcon from '~icons/lucide/check'
import CircleAlertIcon from '~icons/lucide/circle-alert'
import LoaderIcon from '~icons/lucide/loader-circle'

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
				<span {...cx(styles.verdict(), !succeeded && styles.verdictNegative())}>
					<span
						{...styles.verdictIcon({
							tone: succeeded ? 'positive' : 'negative',
						})}
					>
						{succeeded ? (
							<CheckIcon {...styles.icon11()} />
						) : (
							<CircleAlertIcon {...styles.icon11()} />
						)}
					</span>
					{verdictHeadline(execution)}
				</span>
			) : (
				<span {...cx(styles.verdict(), styles.verdictPending())}>
					{/* TDS Spinner draws a fixed black glyph, which disappears on the
					    dark theme, so the loader keeps its own icon. */}
					<LoaderIcon {...styles.loader()} />
					Simulating…
				</span>
			)}

			{props.stale && (
				<Chip tone="warning" title="Inputs changed since this ran">
					stale
				</Chip>
			)}

			{execution && (
				<>
					{/* Same shape as the transaction page's Gas Used row, rendered by
					    the one component the Gas tab's meter also uses. */}
					<span
						{...styles.shrink()}
						title={`Gas used by the simulated call, out of a ${limit.toLocaleString()} limit. Estimated — no fee is charged or synthesized.`}
					>
						<span {...cx(styles.data(), styles.tertiary())}>gas </span>
						<GasRatio used={execution.gasUsed} limit={limit} />
					</span>

					<span
						{...cx(styles.shrink(), styles.data())}
						title={
							input.block === 'latest'
								? 'Executed at the end of the latest block.'
								: 'Executed at the end of this block. Later transactions in the next block are not applied.'
						}
					>
						<span {...styles.tertiary()}>
							{input.block === 'latest' ? 'after ' : 'after block '}
						</span>
						<span {...styles.secondary()}>
							{execution.blockNumber > 0n
								? execution.blockNumber.toLocaleString()
								: '—'}
						</span>
					</span>

					<span {...cx(styles.shrink(), styles.text(), styles.tertiary())}>
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
 */
export function SimulateTabs(props: SimulateTabs.Props): React.JSX.Element {
	return (
		<div role="tablist" {...cx(styles.tabs(), noScrollbar())}>
			{props.tabs.map((tab) => {
				const active = tab.id === props.value
				const empty = tab.count === 0 && tab.id !== 'overview'
				return (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={active}
						disabled={empty}
						onClick={() => props.onChange(tab.id)}
						{...cx(
							styles.tab(),
							transitionColors(),
							empty && styles.tabEmpty(),
							!empty && styles.tabEnabled(),
							!empty && pressDown(),
							!active && !empty && styles.tabIdle(),
							active && styles.tabActive(),
						)}
					>
						{tab.label}
						{tab.count !== undefined && (
							<span {...styles.tabCount()}>{tab.count}</span>
						)}
						{active && <span {...styles.tabIndicator()} />}
					</button>
				)
			})}
		</div>
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
				<p {...styles.answerText()}>
					<span {...styles.tertiary()}>
						<span {...styles.mono()}>{call}</span> returned{' '}
					</span>
					<span {...cx(styles.mono(), styles.primary())}>{returned}</span>
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
			<p {...cx(styles.answerText(), styles.tertiary())}>
				{call && (
					<>
						<span {...styles.mono()}>{call}</span> completed.{' '}
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

	return (
		<div {...styles.failure()}>
			<p {...cx(styles.answerText(), styles.secondary())}>
				{call && <span {...styles.mono()}>{call} </span>}
				<span {...styles.tertiary()}>reverted</span>
			</p>

			{errorName ? (
				<div {...cx(styles.errorBox(), styles.errorBoxStack())}>
					<span {...styles.errorName()}>{errorName}</span>
					{errorArgs.length > 0 && (
						<dl {...styles.errorArgs()}>
							{errorArgs.map((arg) => (
								<React.Fragment key={arg.label}>
									<dt {...styles.tertiary()}>{arg.label}</dt>
									<dd {...styles.errorArgValue()} title={arg.title}>
										<span {...styles.mono()}>{arg.value}</span>
										{arg.note && (
											<span {...styles.errorArgNote()}>{arg.note}</span>
										)}
									</dd>
								</React.Fragment>
							))}
						</dl>
					)}
				</div>
			) : (
				<div {...cx(styles.errorBox(), styles.errorRaw())}>
					{decoded?.raw ?? props.returnData ?? 'No revert data returned.'}
				</div>
			)}

			{failedNode?.hasFailure && failedNode.frameIndex > 0 && (
				<button
					type="button"
					onClick={() => props.onJump(failedNode.id)}
					{...cx(styles.jump(), link(), linkHover(), pressDown())}
				>
					<ArrowRightIcon {...styles.icon11()} />
					Show {call ?? 'the failing frame'} in the trace
				</button>
			)}
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Panels                                                                     */
/* -------------------------------------------------------------------------- */

/** `vs. on-chain` / `vs. previous run` chips beside the answer. */
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
				<span {...styles.tertiary()}>{props.label}</span>
				<Chip tone="neutral">no change</Chip>
			</div>
		)

	return (
		<div {...cx(styles.diff(), styles.wrap())}>
			<span {...cx(styles.tertiary(), styles.leadLabel())}>{props.label}</span>
			{statusChanged && (
				<Chip tone="negative">
					{props.original.status} → {props.execution.status}
				</Chip>
			)}
			{gasDiff !== 0n && (
				<Chip tone={gasDiff < 0n ? 'positive' : 'neutral'}>
					gas {signed(gasDiff)}
				</Chip>
			)}
			{eventDiff !== 0 && <Chip>events {signed(BigInt(eventDiff))}</Chip>}
			{balanceDiff !== 0 && <Chip>balances {signed(BigInt(balanceDiff))}</Chip>}
		</div>
	)
}

/**
 * What was actually run, as a two-column fact grid.
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
			<dl {...styles.facts()}>
				<Fact label="From">
					<Address address={input.from} />
				</Fact>
				<Fact label="Function">
					{props.functionLabel ?? (
						<span {...styles.tertiary()}>unknown selector</span>
					)}
				</Fact>
				<Fact label="To">
					<Address address={input.to} />
				</Fact>
				<Fact label="Value">
					{input.value === '0' ? (
						<span {...styles.tertiary()}>0</span>
					) : (
						input.value
					)}
				</Fact>
				<Fact label="Gas used">
					{execution.gasUsed.toLocaleString()}
					<span {...styles.tertiary()}>
						{' / '}
						{limit.toLocaleString()}
					</span>
				</Fact>
				<Fact
					label="Block"
					hint={
						input.block === 'latest'
							? 'Executed at the end of the latest block.'
							: 'Executed at the end of this block. Later transactions in the next block are not applied.'
					}
				>
					{execution.blockNumber.toLocaleString()}
					<span {...styles.tertiary()}>
						{input.block === 'latest' ? ' latest' : ' pinned'}
					</span>
				</Fact>
			</dl>
			{/* A section title, not another column label. The two used to be the same
			    13px tertiary and stacked directly on top of each other, so the table
			    read as four grey label rows with data somewhere in it. */}
			<div {...styles.section()}>
				<span {...styles.sectionTitle()}>Balance changes</span>
				<span {...cx(styles.data(), styles.tertiary())}>
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

/**
 * Which call of a batch every tab below is showing.
 *
 * A row of numbered squares told you nothing: not what a call does, not which
 * one failed without reading the colour of a 22px glyph, and not that clicking
 * one filters the whole pane. Each chip now names its function, carries its
 * outcome, and the selected one is filled rather than outlined.
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
		<div {...cx(styles.diff(), styles.wrap())}>
			<span {...cx(styles.shrink(), styles.tertiary(), styles.leadLabel())}>
				Showing
			</span>
			{/* A batch is one transaction, so seeing all of it is the default; the
			    per-call chips narrow the evidence rather than switching between
			    unrelated views. */}
			<button
				type="button"
				onClick={() => props.onSelect(undefined)}
				title="Every call of the batch, in order"
				{...cx(
					styles.stepChip(),
					pressDown(),
					transitionColors(),
					props.step !== undefined && styles.stepChipIdle(),
					props.step === undefined && styles.stepChipSelected(),
					props.step === undefined && styles.strong(),
				)}
			>
				All {props.calls.length}
				{failed > 0 && <span {...styles.negative()}>{failed} failed</span>}
			</button>
			<span {...cx(styles.shrink(), styles.tertiary())}>·</span>
			{props.calls.map((call) => (
				<StepChip
					key={call.index}
					call={call}
					label={props.labels[call.index] ?? 'call()'}
					total={props.calls.length}
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
			<span
				{...styles.callGlyph({
					size: 'large',
					tone: failed ? 'negative' : 'positive',
				})}
				title={failed ? 'This call reverted' : 'This call succeeded'}
			>
				{failed ? '✗' : '✓'}
			</span>
			<span {...cx(styles.shrink(), styles.text(), styles.tertiary())}>
				Call {call.index + 1} of {props.total}
			</span>
			<span
				{...cx(
					styles.data(),
					styles.primary(),
					truncate(),
					styles.minWidth(),
					failed && styles.negative(),
				)}
			>
				{label}
			</span>
			<span
				{...cx(
					styles.shrink(),
					styles.data(),
					styles.tertiary(),
					styles.pushRight(),
				)}
			>
				{call.gasUsed.toLocaleString()} gas
			</span>
			<button
				type="button"
				onClick={props.onIsolate}
				title="Show only this call"
				{...cx(
					styles.textButton(),
					styles.shrink(),
					link(),
					linkHover(),
					pressDown(),
				)}
			>
				Isolate
			</button>
		</div>
	)
}

function StepChip(props: {
	call: SimulationCallResult
	label: string
	total: number
	selected: boolean
	onSelect: () => void
}): React.JSX.Element {
	const { call, label, selected } = props
	const failed = call.status === 'reverted'

	return (
		<button
			type="button"
			onClick={props.onSelect}
			title={`Call ${call.index + 1} of ${props.total} — ${call.to}${failed ? ' · reverted' : ' · succeeded'}`}
			{...cx(
				styles.stepChip(),
				styles.stepChipLeading(),
				pressDown(),
				transitionColors(),
				!selected && styles.stepChipIdle(),
				selected && styles.stepChipSelected(),
			)}
		>
			<span
				{...styles.callGlyph({
					size: 'small',
					tone: failed ? 'negative' : 'positive',
				})}
			>
				{failed ? '✗' : '✓'}
			</span>
			<span {...styles.tertiary()}>{call.index + 1}</span>
			<span {...cx(styles.mono(), selected && styles.medium())}>{label}</span>
		</button>
	)
}

/**
 * Net token movement per account.
 *
 * Grouped by account because "what happened to me" is the question. The account
 * cell spans its rows rather than repeating, and rules are drawn only *between*
 * accounts — a uniform rule on every row made a six-row table look like six
 * unrelated facts, and the `↳` continuation glyph was doing the grouping work
 * that a `rowSpan` does properly.
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
		<table {...styles.table()}>
			<thead>
				{/* Tinted card text with its own bottom rule: a column header has to look
				    like chrome, not like the first row of data. */}
				<tr {...styles.headRow()}>
					<th {...cx(styles.headCell(), styles.edge())}>Account</th>
					<th {...cx(styles.headCell(), styles.inner())}>Token</th>
					<th {...cx(styles.headCell(), styles.edge(), styles.numeric())}>
						Change
					</th>
				</tr>
			</thead>
			<tbody>
				{[...byAccount.entries()].flatMap(([account, changes], groupIndex) =>
					changes.map((change, index) => {
						const metadata =
							props.tokenMetadata[change.token] ??
							props.tokenMetadata[change.token.toLowerCase()]
						const positive = change.diff > 0n
						const startsGroup = index === 0
						// Only the boundary between accounts gets a rule.
						const rule = startsGroup && groupIndex > 0
						return (
							<tr key={`${account}-${change.token}`}>
								{startsGroup && (
									<td
										rowSpan={changes.length}
										{...cx(
											styles.bodyCell(),
											styles.edge(),
											rule && styles.rule(),
										)}
									>
										<Address address={account} />
									</td>
								)}
								<td
									{...cx(
										styles.bodyCell(),
										styles.inner(),
										rule && styles.rule(),
									)}
								>
									<Link
										to={
											Tip20.isTip20Address(change.token)
												? '/token/$address'
												: '/address/$address'
										}
										params={{ address: change.token }}
										{...cx(styles.token(), link(), linkHover(), pressDown())}
									>
										<TokenIcon
											address={change.token}
											name={metadata?.symbol}
											className={styles.tokenIcon().className}
										/>
										{metadata?.symbol ?? (
											<span {...styles.mono()}>
												{HexFormatter.truncate(change.token)}
											</span>
										)}
									</Link>
								</td>
								<td
									{...cx(
										styles.bodyCell(),
										styles.edge(),
										styles.numeric(),
										styles.data(),
										styles.primary(),
										rule && styles.rule(),
										positive && styles.positive(),
									)}
									title={`${change.diff.toString()} (raw)`}
								>
									{formatBalanceDelta(change.diff, metadata?.decimals)}
								</td>
							</tr>
						)
					}),
				)}
			</tbody>
		</table>
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
	export const primary = style({ color: 'content.primary' })

	export const secondary = style({ color: 'content.secondary' })

	export const tertiary = style({ color: 'content.tertiary' })

	export const negative = style({ color: 'content.negative' })

	export const positive = style({ color: 'content.positive' })

	export const text = style({ typography: 'body.b2' })

	export const data = style({
		fontVariantNumeric: 'tabular-nums',
		typography: 'body.b2',
	})

	export const strong = style({ typography: 'body.b2Strong' })

	export const mono = style({ typography: 'mono.inline' })

	export const medium = style({ fontWeight: 500 })

	export const shrink = style({ flexShrink: 0 })

	export const minWidth = style({ minWidth: '0 !custom' })

	export const pushRight = style({ marginLeft: 'auto !custom' })

	export const wrap = style({ flexWrap: 'wrap' })

	export const leadLabel = style({ marginRight: '2' })

	export const column = style({ display: 'flex', flexDirection: 'column' })

	export const icon11 = style({
		flexShrink: 0,
		height: '11px !custom',
		width: '11px !custom',
	})

	export const header = style({
		alignItems: 'center',
		backdropFilter: 'blur(8px)',
		backgroundColor: `color-mix(in oklab, ${vars.color.background.secondary} 95%, transparent) !custom`,
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		columnGap: '16',
		display: 'flex',
		flexWrap: 'wrap',
		paddingBlock: '12',
		paddingInline: '16',
		position: 'sticky',
		rowGap: '8',
		top: 'none',
		zIndex: 10,
	})

	export const verdict = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		flexShrink: 0,
		gap: '8',
		typography: 'body.b2',
	})

	export const verdictNegative = style({ color: 'content.negative' })

	export const verdictPending = style({ color: 'content.tertiary' })

	export const verdictIcon = variants({
		base: {
			alignItems: 'center',
			borderRadius: 'full',
			display: 'flex',
			height: '18px !custom',
			justifyContent: 'center',
			width: '18px !custom',
		},
		defaultVariants: { tone: 'positive' },
		variants: {
			tone: {
				negative: {
					backgroundColor: 'container.negative',
					color: 'content.negative',
				},
				positive: {
					backgroundColor: 'container.positive',
					color: 'content.positive',
				},
			},
		},
	})

	export const loader = style({
		animation: `${spin} 1s linear infinite`,
		flexShrink: 0,
		height: '13px !custom',
		width: '13px !custom',
	})

	export const tabs = style({
		alignItems: 'center',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		display: 'flex',
		flexShrink: 0,
		gap: '2',
		overflowX: 'auto',
		paddingInline: '12',
	})

	export const tab = style({
		alignItems: 'center',
		display: 'flex',
		flexShrink: 0,
		gap: '8',
		height: '32',
		paddingInline: '8',
		position: 'relative',
		typography: 'body.b3',
	})

	export const tabEmpty = style({
		color: 'content.tertiary',
		cursor: 'default',
	})

	export const tabEnabled = style({ cursor: 'pointer' })

	export const tabIdle = style({
		color: 'content.tertiary',
		'@media (hover: hover)': { ':hover': { color: 'content.secondary' } },
	})

	export const tabActive = style({
		color: 'content.primary',
		typography: 'body.b3Strong',
	})

	export const tabCount = style({
		color: 'content.tertiary',
		fontVariantNumeric: 'tabular-nums',
		typography: 'body.b3',
	})

	export const tabIndicator = style({
		backgroundColor: 'component.button.primary.fill',
		borderRadius: 'full',
		bottom: '-1px !custom',
		height: '2px !custom',
		insetInline: '4',
		position: 'absolute',
	})

	export const answer = style({ paddingBlock: '12', paddingInline: '16' })

	export const answerText = style({ margin: 'none', typography: 'body.b3' })

	export const failure = style({
		backgroundColor: `color-mix(in oklab, ${vars.color.container.negative} 40%, transparent) !custom`,
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingBlock: '12',
		paddingInline: '16',
	})

	export const errorBox = style({
		backgroundColor: 'container.negative',
		borderColor: 'border.negative',
		borderRadius: '2xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const errorBoxStack = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const errorName = style({
		color: 'content.negative',
		typography: 'body.b3Strong',
	})

	export const errorArgs = style({
		columnGap: '16',
		display: 'grid',
		fontVariantNumeric: 'tabular-nums',
		margin: 'none',
		rowGap: '4',
		typography: 'body.b2',
		'@media (width >= 520px)': {
			gridTemplateColumns: 'max-content minmax(0, 1fr)',
		},
	})

	export const errorArgValue = style({
		color: 'content.primary',
		margin: 'none',
		minWidth: '0 !custom',
		wordBreak: 'break-all',
	})

	export const errorArgNote = style({
		color: 'content.tertiary',
		marginLeft: '8',
	})

	export const errorRaw = style({
		color: 'content.secondary',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const jump = style({
		alignItems: 'center',
		cursor: 'pointer',
		display: 'inline-flex',
		gap: '4',
		typography: 'body.b2',
		width: 'fit-content !custom',
	})

	export const diff = style({
		alignItems: 'center',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		display: 'flex',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const facts = style({
		columnGap: '32',
		display: 'grid',
		margin: 'none',
		paddingBlock: '12',
		paddingInline: '16',
		rowGap: '8',
		'@media (width >= 720px)': {
			gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
		},
	})

	export const section = style({
		alignItems: 'center',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
		display: 'flex',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '16',
	})

	export const sectionTitle = style({
		color: 'content.primary',
		typography: 'body.b2Strong',
	})

	export const stepChip = style({
		alignItems: 'center',
		borderRadius: '2xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		boxSizing: 'border-box',
		cursor: 'pointer',
		display: 'flex',
		flexShrink: 0,
		gap: '8',
		height: '28px !custom',
		paddingLeft: '8',
		paddingRight: '8',
		typography: 'body.b2',
	})

	export const stepChipLeading = style({ paddingLeft: '4' })

	export const stepChipIdle = style({
		borderColor: 'line.secondary',
		color: 'content.tertiary',
		'@media (hover: hover)': {
			':hover': { borderColor: 'line.primary', color: 'content.secondary' },
		},
	})

	export const stepChipSelected = style({
		backgroundColor: 'container.regular',
		borderColor: 'border.focus',
		color: 'content.primary',
	})

	export const callHeading = style({
		alignItems: 'center',
		backgroundColor: 'container.subtle',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '16',
	})

	export const callGlyph = variants({
		base: {
			alignItems: 'center',
			borderRadius: '3xs',
			display: 'flex',
			flexShrink: 0,
			justifyContent: 'center',
			typography: 'mono.inline',
		},
		defaultVariants: { size: 'large', tone: 'positive' },
		variants: {
			size: {
				large: { height: '16', width: '16' },
				small: { height: '15px !custom', width: '15px !custom' },
			},
			tone: {
				negative: {
					backgroundColor: 'container.negative',
					color: 'content.negative',
				},
				positive: {
					backgroundColor: 'container.positive',
					color: 'content.positive',
				},
			},
		},
	})

	export const textButton = style({ cursor: 'pointer', typography: 'body.b2' })

	export const table = style({
		borderCollapse: 'collapse',
		typography: 'body.b2',
		width: '100% !custom',
	})

	export const headRow = style({
		backgroundColor: 'container.subtle',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		color: 'content.tertiary',
	})

	// `fontWeight` undoes the user-agent bold on header cells.
	export const headCell = style({
		fontWeight: 'inherit',
		paddingBlock: '8',
		textAlign: 'left',
	})

	export const edge = style({ paddingInline: '16' })

	export const inner = style({ paddingInline: '12' })

	export const numeric = style({ textAlign: 'right' })

	export const bodyCell = style({ paddingBlock: '8', verticalAlign: 'top' })

	export const rule = style({
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
	})

	export const token = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
	})

	// TokenIcon keeps its default size in `:where()`, so this resizes it.
	export const tokenIcon = style({
		height: '14px !custom',
		width: '14px !custom',
	})

	export const events = style({
		display: 'flex',
		flexDirection: 'column',
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: 'regular',
				borderColor: 'line.secondary',
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
		typography: 'body.b3',
	})

	export const eventIndex = style({
		color: 'content.tertiary',
		flexShrink: 0,
		fontVariantNumeric: 'tabular-nums',
		marginTop: '2',
		typography: 'body.b3',
	})
}
