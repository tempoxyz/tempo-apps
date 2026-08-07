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
import type * as OxAddress from 'ox/Address'
import * as React from 'react'
import type { Log } from 'viem'
import { Address } from '#comps/Address'
import { TokenIcon } from '#comps/TokenIcon'
import { TxEventDescription } from '#comps/TxEventDescription'
import { cx } from '#lib/css'
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
		<div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-[14px] gap-y-[8px] border-b border-card-border bg-card-header/95 px-[16px] py-[10px] backdrop-blur">
			{execution ? (
				<span
					className={cx(
						'flex shrink-0 items-center gap-[6px] text-[14px] font-medium',
						succeeded ? 'text-primary' : 'text-negative',
					)}
				>
					<span
						className={cx(
							'flex size-[18px] items-center justify-center rounded-full',
							succeeded
								? 'bg-base-content-positive/15 text-base-content-positive'
								: 'bg-negative/15 text-negative',
						)}
					>
						{succeeded ? (
							<CheckIcon className="size-[11px]" />
						) : (
							<CircleAlertIcon className="size-[11px]" />
						)}
					</span>
					{verdictHeadline(execution)}
				</span>
			) : (
				<span className="flex shrink-0 items-center gap-[6px] text-[14px] font-medium text-tertiary">
					<LoaderIcon className="size-[13px] animate-spin" />
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
						className="shrink-0"
						title={`Gas used by the simulated call, out of a ${limit.toLocaleString()} limit. Estimated — no fee is charged or synthesized.`}
					>
						<span className="font-mono text-[12px] text-tertiary">gas </span>
						<GasRatio used={execution.gasUsed} limit={limit} />
					</span>

					<span
						className="shrink-0 font-mono text-[12px]"
						title={
							input.block === 'latest'
								? 'Executed at the end of the latest block.'
								: 'Executed at the end of this block. Later transactions in the next block are not applied.'
						}
					>
						<span className="text-tertiary">
							{input.block === 'latest' ? 'after ' : 'after block '}
						</span>
						<span className="text-secondary">
							{execution.blockNumber > 0n
								? execution.blockNumber.toLocaleString()
								: '—'}
						</span>
					</span>

					<span className="shrink-0 text-[11px] text-content-dimmed">
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
		<div
			role="tablist"
			className="flex shrink-0 items-center gap-[2px] overflow-x-auto border-b border-card-border px-[10px] no-scrollbar"
		>
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
						className={cx(
							'relative flex h-[34px] shrink-0 items-center gap-[6px] px-[8px] text-[13px] transition-colors',
							empty
								? 'cursor-default text-content-dimmed'
								: 'cursor-pointer press-down',
							active
								? 'font-medium text-primary'
								: !empty && 'text-tertiary hover:text-secondary',
						)}
					>
						{tab.label}
						{tab.count !== undefined && (
							<span
								className={cx(
									'font-mono text-[11px]',
									active ? 'text-tertiary' : 'text-content-dimmed',
								)}
							>
								{tab.count}
							</span>
						)}
						{active && (
							<span className="absolute inset-x-[4px] -bottom-px h-[2px] rounded-full bg-accent" />
						)}
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
				<p className="text-[13px] text-secondary">
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
				<p className="font-mono text-[13px]">
					<span className="text-tertiary">{call} returned </span>
					<span className="font-medium text-primary">{returned}</span>
				</p>
			</AnswerShell>
		)

	if (event)
		return (
			<AnswerShell>
				<div className="text-[13px] text-secondary">
					<TxEventDescription event={event} />
				</div>
			</AnswerShell>
		)

	return (
		<AnswerShell>
			<p className="text-[13px] text-tertiary">
				{call ? `${call} completed. ` : ''}
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
	return <div className="px-[16px] py-[12px]">{props.children}</div>
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
		<div className="flex flex-col gap-[8px] border-b border-card-border bg-negative/[0.03] px-[16px] py-[12px]">
			<p className="font-mono text-[13px] text-secondary">
				{call ? `${call} ` : ''}
				<span className="text-tertiary">reverted</span>
			</p>

			{errorName ? (
				<div className="flex flex-col gap-[6px] rounded-[7px] border border-negative/25 bg-negative/6 px-[11px] py-[9px]">
					<span className="font-mono text-[13px] font-medium text-negative">
						{errorName}
					</span>
					{errorArgs.length > 0 && (
						<dl className="grid gap-x-[14px] gap-y-[3px] font-mono text-[12px] min-[520px]:grid-cols-[max-content_minmax(0,1fr)]">
							{errorArgs.map((arg) => (
								<React.Fragment key={arg.label}>
									<dt className="text-tertiary">{arg.label}</dt>
									<dd
										className="min-w-0 break-all text-primary"
										title={arg.title}
									>
										{arg.value}
										{arg.note && (
											<span className="ml-[8px] text-content-dimmed">
												{arg.note}
											</span>
										)}
									</dd>
								</React.Fragment>
							))}
						</dl>
					)}
				</div>
			) : (
				<div className="rounded-[7px] border border-negative/25 bg-negative/6 px-[11px] py-[9px] font-mono text-[12px] break-all text-secondary">
					{decoded?.raw ?? props.returnData ?? 'No revert data returned.'}
				</div>
			)}

			{failedNode?.hasFailure && failedNode.frameIndex > 0 && (
				<button
					type="button"
					onClick={() => props.onJump(failedNode.id)}
					className="inline-flex w-fit items-center gap-[4px] text-[11px] text-accent cursor-pointer press-down hover:underline"
				>
					<ArrowRightIcon className="size-[11px]" />
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
			<div className="flex items-center gap-[6px] border-b border-dashed border-card-border px-[16px] py-[7px] text-[11px]">
				<span className="text-tertiary">{props.label}</span>
				<Chip tone="neutral">no change</Chip>
			</div>
		)

	return (
		<div className="flex flex-wrap items-center gap-[6px] border-b border-dashed border-card-border px-[16px] py-[7px] text-[11px]">
			<span className="mr-[2px] text-tertiary">{props.label}</span>
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
		<div className="flex flex-col">
			<dl className="grid gap-x-[28px] gap-y-[7px] px-[16px] py-[12px] min-[720px]:grid-cols-2">
				<Fact label="From">
					<Address address={input.from} />
				</Fact>
				<Fact label="Function">
					{props.functionLabel ?? (
						<span className="text-tertiary">unknown selector</span>
					)}
				</Fact>
				<Fact label="To">
					<Address address={input.to} />
				</Fact>
				<Fact label="Value">
					{input.value === '0' ? (
						<span className="text-tertiary">0</span>
					) : (
						input.value
					)}
				</Fact>
				<Fact label="Gas used">
					{execution.gasUsed.toLocaleString()}
					<span className="text-content-dimmed">
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
					<span className="text-content-dimmed">
						{input.block === 'latest' ? ' latest' : ' pinned'}
					</span>
				</Fact>
			</dl>
			{/* A section title, not another column label. The two used to be the same
			    13px tertiary and stacked directly on top of each other, so the table
			    read as four grey label rows with data somewhere in it. */}
			<div className="flex items-center gap-[8px] border-y border-dashed border-card-border px-[16px] py-[8px]">
				<span className="text-[13px] font-medium text-primary">
					Balance changes
				</span>
				<span className="font-mono text-[12px] text-tertiary">
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
		<div className="flex flex-wrap items-center gap-[6px] border-b border-card-border px-[16px] py-[8px]">
			<span className="mr-[2px] shrink-0 text-[11px] text-tertiary">
				Showing
			</span>
			{/* A batch is one transaction, so seeing all of it is the default; the
			    per-call chips narrow the evidence rather than switching between
			    unrelated views. */}
			<button
				type="button"
				onClick={() => props.onSelect(undefined)}
				title="Every call of the batch, in order"
				className={cx(
					'flex h-[24px] shrink-0 items-center gap-[6px] rounded-[6px] border px-[8px] text-[11px] cursor-pointer press-down transition-colors',
					props.step === undefined
						? 'border-accent bg-accent/10 font-medium text-primary'
						: 'border-card-border text-tertiary hover:border-tertiary/40 hover:text-secondary',
				)}
			>
				All {props.calls.length}
				{failed > 0 && (
					<span className="font-mono text-negative">{failed} failed</span>
				)}
			</button>
			<span className="shrink-0 text-content-dimmed">·</span>
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
		<div className="flex flex-wrap items-center gap-[8px] border-b border-dashed border-card-border bg-base-alt px-[16px] py-[7px]">
			<span
				className={cx(
					'flex size-[16px] shrink-0 items-center justify-center rounded-[4px] font-mono text-[10px]',
					failed
						? 'bg-negative/15 text-negative'
						: 'bg-base-content-positive/15 text-base-content-positive',
				)}
				title={failed ? 'This call reverted' : 'This call succeeded'}
			>
				{failed ? '✗' : '✓'}
			</span>
			<span className="shrink-0 text-[11px] text-tertiary">
				Call {call.index + 1} of {props.total}
			</span>
			<span
				className={cx(
					'min-w-0 truncate font-mono text-[12px]',
					failed ? 'text-negative' : 'text-primary',
				)}
			>
				{label}
			</span>
			<span className="ml-auto shrink-0 font-mono text-[11px] text-tertiary">
				{call.gasUsed.toLocaleString()} gas
			</span>
			<button
				type="button"
				onClick={props.onIsolate}
				title="Show only this call"
				className="shrink-0 text-[11px] text-accent cursor-pointer press-down hover:underline"
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
			className={cx(
				'flex h-[24px] shrink-0 items-center gap-[6px] rounded-[6px] border pr-[8px] pl-[5px] text-[11px] cursor-pointer press-down transition-colors',
				selected
					? 'border-accent bg-accent/10 text-primary'
					: 'border-card-border text-tertiary hover:border-tertiary/40 hover:text-secondary',
			)}
		>
			<span
				className={cx(
					'flex size-[15px] shrink-0 items-center justify-center rounded-[4px] font-mono text-[10px]',
					failed
						? 'bg-negative/15 text-negative'
						: 'bg-base-content-positive/15 text-base-content-positive',
				)}
			>
				{failed ? '✗' : '✓'}
			</span>
			<span className="font-mono text-content-dimmed">{call.index + 1}</span>
			<span className={cx('font-mono', selected && 'font-medium')}>
				{label}
			</span>
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
		<table className="w-full text-[12px]">
			<thead>
				{/* Tinted, 11px, its own bottom rule: a column header has to look
				    like chrome, not like the first row of data. */}
				<tr className="border-b border-card-border bg-base-alt text-[11px] text-tertiary">
					<th className="px-[16px] py-[6px] text-left font-normal">Account</th>
					<th className="px-[10px] py-[6px] text-left font-normal">Token</th>
					<th className="px-[16px] py-[6px] text-right font-normal">Change</th>
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
										className={cx(
											'px-[16px] py-[7px] align-top',
											rule && 'border-t border-card-border',
										)}
									>
										<Address address={account} />
									</td>
								)}
								<td
									className={cx(
										'px-[10px] py-[7px] align-top',
										rule && 'border-t border-card-border',
									)}
								>
									<Link
										to={
											Tip20.isTip20Address(change.token)
												? '/token/$address'
												: '/address/$address'
										}
										params={{ address: change.token }}
										className="inline-flex items-center gap-[5px] text-accent press-down hover:underline"
									>
										<TokenIcon
											address={change.token}
											name={metadata?.symbol}
											className="size-[14px]!"
										/>
										{metadata?.symbol ?? HexFormatter.truncate(change.token)}
									</Link>
								</td>
								<td
									className={cx(
										'px-[16px] py-[7px] text-right align-top font-mono tabular-nums',
										rule && 'border-t border-card-border',
										positive ? 'text-base-content-positive' : 'text-primary',
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
		<div className="flex flex-col divide-y divide-card-border">
			{props.knownEvents.map((event, index) => (
				<div
					key={`${event.type}-${index}`}
					className="flex items-start gap-[10px] px-[16px] py-[9px] text-[13px]"
				>
					<span className="mt-[3px] shrink-0 font-mono text-[11px] text-content-dimmed tabular-nums">
						{index + 1}
					</span>
					<TxEventDescription event={event} />
				</div>
			))}
		</div>
	)
}
