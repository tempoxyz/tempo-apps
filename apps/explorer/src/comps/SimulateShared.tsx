/**
 * Shared primitives for the simulator.
 *
 * The simulator uses the explorer's shared card typography roles:
 *
 *   type-card       labels, controls, prose
 *   type-card-data  trace, hex, numbers
 *   14px            exactly one headline per pane
 *   11px            compact status chips only
 *
 * Weight carries hierarchy, not size: `font-medium` marks a title or the one
 * value that is the answer, everything else is `font-normal`. There is no bold.
 *
 * Colour means one thing each:
 *   accent    you can click it
 *   positive  it succeeded          negative  it failed
 *   viz/code  it is code or data    tertiary  it is a label
 */

import * as OxAddress from 'ox/Address'
import * as OxHex from 'ox/Hex'
import * as Value from 'ox/Value'
import type * as React from 'react'
import type { Abi } from 'viem'
import { decodeFunctionData } from 'viem'
import { cx } from '#lib/css'
import { formatAbiValue, getContractInfo } from '#lib/domain/contracts'
import type { FormState } from '#lib/domain/simulate-calls'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import { SimulationApiError } from '#lib/queries'
import type { TxTraceTree } from './TxTraceTree'

// Lives with the panel chrome so the toolbar toggles and this one are literally
// the same control; re-exported here because the simulator imports it from the
// shared-primitives module alongside everything else it uses.
export { SegmentedControl } from './PanelToolbar'
import CircleAlertIcon from '~icons/lucide/circle-alert'
import RotateCcwIcon from '~icons/lucide/rotate-ccw'

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

/** Label above a control. */
export function Field(props: Field.Props): React.JSX.Element {
	return (
		<div className="flex min-w-0 flex-col gap-[5px]">
			<div className="flex items-center justify-between gap-[8px]">
				<span className="type-card text-tertiary">{props.label}</span>
				{props.action}
			</div>
			{props.children}
			{props.hint && (
				<span
					className={cx(
						'type-card',
						props.invalid ? 'text-negative' : 'text-content-dimmed',
					)}
				>
					{props.hint}
				</span>
			)}
		</div>
	)
}

export declare namespace Field {
	interface Props {
		label: React.ReactNode
		children: React.ReactNode
		/** Right-aligned control on the label line — a mode toggle, a link. */
		action?: React.ReactNode
		hint?: React.ReactNode
		invalid?: boolean
	}
}

const inputClassName =
	'w-full min-w-0 rounded-[6px] border border-card-border bg-base-plane px-[9px] py-[6px] type-card-data text-primary outline-none transition-colors placeholder:text-field-content-secondary focus:border-accent'

/** Invalid state is applied on blur, never on mount — see `draftFieldErrors`. */
export function inputClass(invalid?: boolean): string {
	return cx(inputClassName, invalid && 'border-negative focus:border-negative')
}

/** A primary action. There is at most one per pane. */
export function Button(props: Button.Props): React.JSX.Element {
	const { tone = 'default', ...rest } = props
	return (
		<button
			type="button"
			{...rest}
			className={cx(
				'flex h-[28px] shrink-0 items-center gap-[6px] rounded-[7px] px-[10px] type-card cursor-pointer press-down transition-colors disabled:cursor-not-allowed disabled:opacity-50',
				// `text-white-black` is white on the light-mode accent and black on the
				// lighter dark-mode accent, which is the readable pairing in both.
				tone === 'primary'
					? 'bg-accent font-medium text-white-black hover:bg-accent-hover'
					: 'border border-card-border text-secondary hover:text-primary',
				props.className,
			)}
		>
			{props.children}
		</button>
	)
}

export declare namespace Button {
	interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
		tone?: 'default' | 'primary'
	}
}

/* -------------------------------------------------------------------------- */
/* Data display                                                               */
/* -------------------------------------------------------------------------- */

/** Small status/meta pill. Tone is the only thing that carries colour. */
export function Chip(props: Chip.Props): React.JSX.Element {
	const { tone = 'neutral' } = props
	return (
		<span
			title={props.title}
			className={cx(
				'inline-flex shrink-0 items-center gap-[4px] rounded-[5px] px-[5px] py-[1px] text-[11px] whitespace-nowrap',
				tone === 'positive' &&
					'bg-base-content-positive/12 text-base-content-positive',
				tone === 'negative' && 'bg-negative/12 text-negative',
				tone === 'warning' && 'bg-warning/15 text-warning',
				tone === 'accent' && 'bg-accent/12 text-accent',
				tone === 'neutral' && 'bg-distinct text-tertiary',
				props.className,
			)}
		>
			{props.children}
		</span>
	)
}

export declare namespace Chip {
	interface Props {
		children: React.ReactNode
		tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'accent'
		title?: string
		className?: string
	}
}

/**
 * A label/value pair in the result header using the shared card roles.
 */
export function Fact(props: Fact.Props): React.JSX.Element {
	return (
		<div className="flex min-w-0 items-baseline gap-[8px]">
			<span
				className="w-[72px] shrink-0 type-card text-tertiary"
				title={props.hint}
			>
				{props.label}
			</span>
			<span className="min-w-0 truncate type-card-data text-primary">
				{props.children}
			</span>
		</div>
	)
}

export declare namespace Fact {
	interface Props {
		label: React.ReactNode
		children: React.ReactNode
		hint?: string
	}
}

/**
 * Gas used against the limit it ran under.
 *
 * A bare "273,270 gas" answers nothing — the actionable question is whether
 * the call is anywhere near running out, which is the ratio. Tone only turns
 * warm past 80%, so a normal call has no colour here at all.
 */
export function GasMeter(props: GasMeter.Props): React.JSX.Element {
	const pct = gasPercent(props.used, props.limit)
	const warm = pct >= GAS_PRESSURE_THRESHOLD
	return (
		<div className="flex flex-col gap-[6px]">
			<div className="flex items-baseline justify-between gap-[8px]">
				<span className="type-card text-tertiary">Gas used</span>
				<GasRatio used={props.used} limit={props.limit} />
			</div>
			<div className="h-[4px] w-full overflow-hidden rounded-full bg-distinct">
				<div
					className={cx(
						'h-full rounded-full transition-[width]',
						warm ? 'bg-warning' : 'bg-viz-base',
					)}
					// Always show a sliver, so "it ran" is visually distinct from "it didn't".
					style={{ width: `max(${Math.min(pct, 100)}%, 2px)` }}
				/>
			</div>
		</div>
	)
}

export declare namespace GasMeter {
	interface Props {
		used: bigint
		limit: bigint
	}
}

/**
 * Above this share of the gas limit the limit starts to matter and the
 * percentage earns colour. Below it, it is shown but stays out of the way.
 */
export const GAS_PRESSURE_THRESHOLD = 80

/** Share of the limit a run consumed, as a percentage. */
export function gasPercent(used: bigint, limit: bigint): number {
	return limit > 0n ? Number((used * 10_000n) / limit) / 100 : 0
}

/**
 * `used / limit (pct)` — the transaction page's format, one implementation.
 *
 * Warning, never negative: red on this page means the call failed, and a
 * succeeded-at-99% result printing a red number reads as a contradiction.
 * Running out of gas shows up as a revert anyway.
 */
export function GasRatio(props: {
	used: bigint
	limit: bigint
	className?: string
}): React.JSX.Element {
	const pct = gasPercent(props.used, props.limit)
	return (
		<span className={cx('type-card-data', props.className)}>
			<span className="text-primary">{props.used.toLocaleString()}</span>
			<span className="text-content-dimmed">
				{' / '}
				{props.limit.toLocaleString()}
			</span>
			<span
				className={cx(
					'ml-[5px]',
					pct >= GAS_PRESSURE_THRESHOLD
						? 'text-warning'
						: 'text-content-dimmed',
				)}
			>
				({formatGasPercent(pct)})
			</span>
		</span>
	)
}

/** `0.45%`, `1%`, `<0.01%` — never `0%` for a call that actually used gas. */
export function formatGasPercent(pct: number): string {
	if (pct === 0) return '0%'
	if (pct < 0.01) return '<0.01%'
	if (pct < 1) return `${pct.toFixed(2)}%`
	if (pct < 10) return `${pct.toFixed(1)}%`
	return `${Math.round(pct)}%`
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

export function PanelSkeleton(props: { rows: number }): React.JSX.Element {
	return (
		<div className="flex animate-pulse flex-col gap-[9px] px-[16px] py-[14px]">
			{Array.from({ length: props.rows }, (_, index) => (
				<div
					key={index}
					className="h-[10px] rounded bg-distinct"
					style={{ width: `${88 - (index % 3) * 14}%` }}
				/>
			))}
		</div>
	)
}

/** Nothing to show, said in one line rather than in a centred hero. */
export function PanelEmpty(props: {
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<div className="px-[16px] py-[18px] type-card text-tertiary">
			{props.children}
		</div>
	)
}

export function PanelError(props: {
	title: string
	error: Error
}): React.JSX.Element {
	const rateLimited =
		props.error instanceof SimulationApiError && props.error.status === 429
	return (
		<div className="flex flex-col gap-[4px] px-[16px] py-[14px] type-card">
			<span className="text-negative">
				{rateLimited ? 'Rate limited' : props.title}
			</span>
			<span className="type-card-data break-all text-tertiary">
				{props.error.message}
			</span>
		</div>
	)
}

/**
 * Whole-simulation failure: one box, not one per panel. The three panels share
 * one endpoint and one node, so anything wrong with the request fails all three
 * identically, and repeating it says nothing extra. Titled by what the user can
 * do about it rather than by which query object threw.
 */
export function SimulationFailure(props: {
	errors: Error[]
	onRetry: () => void
}): React.JSX.Element {
	const status = props.errors.find(
		(error): error is SimulationApiError => error instanceof SimulationApiError,
	)?.status
	const { title, hint } = describeFailure(status)
	const messages = [...new Set(props.errors.map((error) => error.message))]

	return (
		<div className="flex items-start gap-[10px] rounded-[10px] border border-negative/40 bg-card px-[16px] py-[14px]">
			<CircleAlertIcon className="mt-[2px] size-[14px] shrink-0 text-negative" />
			<div className="flex min-w-0 flex-1 flex-col gap-[6px]">
				<h2 className="text-[13px] font-medium text-negative">{title}</h2>
				<p className="type-card text-secondary">{hint}</p>
				<div className="flex flex-col gap-[4px]">
					{messages.map((message) => (
						<code
							key={message}
							className="block rounded-[6px] bg-distinct px-[9px] py-[6px] type-card-data break-all text-tertiary"
						>
							{message}
						</code>
					))}
				</div>
				<Button onClick={props.onRetry} className="mt-[2px]">
					<RotateCcwIcon className="size-[12px]" />
					Try again
				</Button>
			</div>
		</div>
	)
}

function describeFailure(status: number | undefined): {
	title: string
	hint: string
} {
	if (status === 429)
		return {
			title: 'Rate limited',
			hint: 'Too many simulations in a short window. Wait a few seconds and run it again.',
		}
	if (status === 504)
		return {
			title: 'Simulation timed out',
			hint: 'The node took too long to trace this call. A lower gas limit or a pinned block may help.',
		}
	if (status === 400)
		return {
			title: 'This call could not be simulated',
			hint: 'The request was rejected before it reached the node. Check the addresses, calldata, and gas limit.',
		}
	return {
		title: 'The node rejected this simulation',
		hint: 'Nothing was traced. This is usually the call itself — an unsupported target, or a block the node no longer has state for.',
	}
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** `0xdEaD…dEaD → pathUSD.transfer(0x…0002, …)`, or `→ 2 calls`. */
/**
 * Longest argument list worth inlining in the header.
 *
 * Two short arguments read as a sentence. Six truncated hashes read as noise —
 * every one of them is elided to `0x…` anyway, so the list costs the width of
 * the whole header and tells you nothing you could act on. Past this the count
 * says more than the values.
 */
const MAX_SUMMARY_ARG_CHARS = 32

export function describeCall(form: FormState, abi: Abi | undefined): string {
	const first = form.calls[0]
	if (!first || (!first.to.trim() && !first.data.trim())) return 'New call'

	const from = OxAddress.validate(form.from)
		? HexFormatter.truncate(form.from as OxHex.Hex)
		: form.from || 'anyone'

	if (form.calls.length > 1) return `${from} → ${form.calls.length} calls`

	// A resolved name is both shorter and more informative than the address it
	// stands for; the form's `To` field already names the same contract.
	const to = OxAddress.validate(first.to)
		? (getContractInfo(first.to as OxAddress.Address)?.name ??
			HexFormatter.truncate(first.to as OxHex.Hex))
		: first.to || '—'

	let call =
		first.data && first.data !== '0x'
			? `${first.data.slice(0, 10)}()`
			: 'call()'
	if (abi && OxHex.validate(first.data) && first.data.length >= 10) {
		try {
			const decoded = decodeFunctionData({ abi, data: first.data as OxHex.Hex })
			const values = (decoded.args ?? []).map((value) =>
				shorten(inputValueToString(value)),
			)
			const joined = values.join(', ')
			const args =
				joined.length <= MAX_SUMMARY_ARG_CHARS
					? joined
					: `…${values.length} args`
			call = `${decoded.functionName}(${args})`
		} catch {
			// Unknown selector — the hex form above is a fine fallback.
		}
	}

	return `${from} → ${to}.${call}`
}

function shorten(value: string): string {
	if (value.length <= 14) return value
	return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function callLabel(node: TxTraceTree.Node): string {
	const contract =
		node.contractName ??
		(node.trace.to ? HexFormatter.truncate(node.trace.to) : 'contract')
	const fn = node.functionName ?? node.selector ?? 'call'
	return `${contract}.${fn}()`
}

export function inputValueToString(value: unknown): string {
	if (typeof value === 'bigint') return value.toString()
	if (typeof value === 'string' || typeof value === 'boolean')
		return String(value)
	try {
		return JSON.stringify(value, (_, item) =>
			typeof item === 'bigint' ? item.toString() : item,
		)
	} catch {
		return formatAbiValue(value)
	}
}

export function signed(value: bigint): string {
	if (value === 0n) return '±0'
	return `${value > 0n ? '+' : '−'}${(value < 0n ? -value : value).toLocaleString()}`
}

/**
 * Formats with the token's decimals, or falls back to the raw integer. A raw
 * integer here reads as a wildly wrong number (0.1 USDC.e shows as 100,000),
 * which is worse than showing nothing.
 */
export function formatBalanceDelta(
	diff: bigint,
	decimals: number | undefined,
): string {
	const sign = diff > 0n ? '+' : '−'
	const magnitude = diff < 0n ? -diff : diff
	if (decimals === undefined) return `${sign}${magnitude.toLocaleString()}`
	return `${sign}${PriceFormatter.formatAmount(Value.format(magnitude, decimals))}`
}

/** Abbreviates large gas counts the way a trace gutter needs: `7.97M`. */
export function formatGas(gas: number): string {
	if (gas >= 1_000_000) return `${(gas / 1_000_000).toFixed(2)}M`
	if (gas >= 100_000) return `${Math.round(gas / 1_000)}k`
	return gas.toLocaleString()
}
