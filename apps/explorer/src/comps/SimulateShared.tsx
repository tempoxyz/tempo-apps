/** Shared simulator controls use Tempo Design System type scales and semantic
 * colors. Pilat is the UI face; explicit code and hash values use JetBrains Mono.
 */

import { vars as core } from '@tempoxyz/ds/core'
import { Button as TdsButton, style, variants } from '@tempoxyz/ds/platform'
import * as OxAddress from 'ox/Address'
import * as OxHex from 'ox/Hex'
import * as Value from 'ox/Value'
import type * as React from 'react'
import type { Abi } from 'viem'
import { decodeFunctionData } from 'viem'
import { cx } from 'zyzz'
import { formatAbiValue, getContractInfo } from '#lib/domain/contracts'
import type { FormState } from '#lib/domain/simulate-calls'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import { SimulationApiError } from '#lib/queries'
import { pulse, truncate } from '#styles/explorer'
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
		<div {...styles.field()}>
			<div {...styles.fieldHeader()}>
				<span {...styles.fieldLabel()}>{props.label}</span>
				{props.action}
			</div>
			{props.children}
			{props.hint && (
				<span
					{...cx(
						styles.fieldHint(),
						props.invalid && styles.fieldHintInvalid(),
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

/**
 * Text field chrome shared by every simulator input, select, and textarea:
 * a compact TDS TextInput (input fill, no visible border, the global focus
 * ring). The transparent border reserves room for the invalid state.
 */
export const fieldInput = style({
	backgroundColor: 'component.input.primary.fill',
	borderColor: 'transparent !custom',
	borderRadius: 'xs',
	borderStyle: 'solid',
	borderWidth: 'regular',
	boxSizing: 'border-box',
	color: 'content.primary',
	fontVariantNumeric: 'tabular-nums',
	minWidth: '0 !custom',
	paddingBlock: '8',
	paddingInline: '12',
	transitionDuration: '150ms',
	transitionProperty:
		'color, background-color, border-color, outline-color, text-decoration-color, fill, stroke',
	transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
	typography: 'body.b2',
	width: '100% !custom',
	'::placeholder': { color: 'content.tertiary' },
})

/** Invalid state is applied on blur, never on mount — see `draftFieldErrors`. */
export const fieldInputInvalid = style({ borderColor: 'border.negative' })

/** Leading icon inside a simulator `Button`. */
export const buttonIcon = style({
	flexShrink: 0,
	height: '12px !custom',
	width: '12px !custom',
})

/** A primary action. There is at most one per pane. */
export function Button(props: Button.Props): React.JSX.Element {
	const { tone = 'default', ...rest } = props
	return (
		<TdsButton
			type="button"
			{...rest}
			scale="small"
			variant={tone === 'primary' ? 'primary' : 'secondary'}
		/>
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

/**
 * Small status/meta pill. Tone is the only thing that carries colour.
 *
 * Local rather than TDS `Badge`: Badge has no tones and is sized for
 * standalone labels (28px tall, 80px wide minimum), while this sits inline in
 * a header row and on a field's label line.
 */
export function Chip(props: Chip.Props): React.JSX.Element {
	const { tone = 'neutral' } = props
	return (
		<span
			title={props.title}
			{...styles.chip({ className: props.className, tone })}
		>
			<span {...truncate()}>{props.children}</span>
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
		<div {...styles.fact()}>
			<span {...styles.factLabel()} title={props.hint}>
				{props.label}
			</span>
			<span {...cx(styles.factValue(), truncate())}>{props.children}</span>
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
		<div {...styles.gasMeter()}>
			<div {...styles.gasMeterHeader()}>
				<span {...styles.gasMeterLabel()}>Gas used</span>
				<GasRatio used={props.used} limit={props.limit} />
			</div>
			<div {...styles.gasTrack()}>
				<div
					{...cx(
						styles.gasFill({
							// Always show a sliver, so "it ran" is visually distinct from "it didn't".
							style: { width: `max(${Math.min(pct, 100)}%, 2px)` },
						}),
						warm && styles.gasFillWarm(),
					)}
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
		<span {...styles.gasRatio({ className: props.className })}>
			<span {...styles.gasRatioUsed()}>{props.used.toLocaleString()}</span>
			<span {...styles.gasRatioLimit()}>
				{' / '}
				{props.limit.toLocaleString()}
			</span>
			<span
				{...cx(
					styles.gasRatioPercent(),
					pct >= GAS_PRESSURE_THRESHOLD && styles.gasRatioPercentWarm(),
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
		<div {...styles.skeleton()}>
			{Array.from({ length: props.rows }, (_, index) => (
				<div
					key={index}
					{...styles.skeletonRow({
						style: { width: `${88 - (index % 3) * 14}%` },
					})}
				/>
			))}
		</div>
	)
}

/** Nothing to show, said in one line rather than in a centred hero. */
export function PanelEmpty(props: {
	children: React.ReactNode
}): React.JSX.Element {
	return <div {...styles.panelEmpty()}>{props.children}</div>
}

export function PanelError(props: {
	title: string
	error: Error
}): React.JSX.Element {
	const rateLimited =
		props.error instanceof SimulationApiError && props.error.status === 429
	return (
		<div {...styles.panelError()}>
			<span {...styles.panelErrorTitle()}>
				{rateLimited ? 'Rate limited' : props.title}
			</span>
			<span {...styles.panelErrorMessage()}>{props.error.message}</span>
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

	// Laid out like a TDS negative `Alert`: tinted container, no border.
	return (
		<div {...styles.failure()}>
			<CircleAlertIcon {...styles.failureIcon()} />
			<div {...styles.failureBody()}>
				<h2 {...styles.failureTitle()}>{title}</h2>
				<p {...styles.failureHint()}>{hint}</p>
				<div {...styles.failureMessages()}>
					{messages.map((message) => (
						<code key={message} {...styles.failureMessage()}>
							{message}
						</code>
					))}
				</div>
				<Button onClick={props.onRetry} {...styles.failureRetry()}>
					<RotateCcwIcon {...buttonIcon()} />
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

namespace styles {
	export const field = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0 !custom',
	})

	export const fieldHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
	})

	export const fieldLabel = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})

	export const fieldHint = style({
		color: 'content.tertiary',
		typography: 'body.b2',
	})

	export const fieldHintInvalid = style({ color: 'content.negative' })

	export const chip = variants({
		base: {
			alignItems: 'center',
			borderRadius: 'full',
			boxSizing: 'border-box',
			display: 'inline-flex',
			height: '20px !custom',
			maxWidth: '100% !custom',
			minWidth: '0 !custom',
			paddingInline: '8',
			typography: 'body.b3',
			whiteSpace: 'nowrap',
		},
		defaultVariants: { tone: 'neutral' },
		variants: {
			tone: {
				accent: {
					// TDS has no blue container; this is the Alert `tip` tint.
					backgroundColor: 'rgb(68 113 237 / 0.08) !custom',
					color: `light-dark(${core.color.accent.blueLight}, ${core.color.accent.blueDark}) !custom`,
				},
				negative: {
					backgroundColor: 'container.negative',
					color: 'content.negative',
				},
				neutral: {
					backgroundColor: 'container.regular',
					color: 'content.secondary',
				},
				positive: {
					backgroundColor: 'container.positive',
					color: 'content.positive',
				},
				warning: {
					backgroundColor: 'container.warning',
					color: 'content.warning',
				},
			},
		},
	})

	export const fact = style({
		alignItems: 'baseline',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const factLabel = style({
		color: 'content.tertiary',
		flexShrink: 0,
		typography: 'body.b2',
		width: '72px !custom',
	})

	export const factValue = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0 !custom',
		typography: 'body.b2',
	})

	export const gasMeter = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const gasMeterHeader = style({
		alignItems: 'baseline',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
	})

	export const gasMeterLabel = style({
		color: 'content.tertiary',
		typography: 'body.b2',
	})

	export const gasTrack = style({
		backgroundColor: 'container.strong',
		borderRadius: 'full',
		height: '4px !custom',
		overflow: 'hidden',
		width: '100% !custom',
	})

	export const gasFill = style({
		backgroundColor: `light-dark(${core.color.accent.violetLight}, ${core.color.accent.violetDark}) !custom`,
		borderRadius: 'full',
		height: '100% !custom',
		transitionDuration: '150ms',
		transitionProperty: 'width',
		transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
	})

	export const gasFillWarm = style({ backgroundColor: 'content.warning' })

	export const gasRatio = style({
		fontVariantNumeric: 'tabular-nums',
		typography: 'body.b2',
	})

	export const gasRatioUsed = style({ color: 'content.primary' })

	export const gasRatioLimit = style({ color: 'content.tertiary' })

	export const gasRatioPercent = style({
		color: 'content.tertiary',
		marginLeft: '4',
	})

	export const gasRatioPercentWarm = style({ color: 'content.warning' })

	export const skeleton = style({
		animation: `${pulse} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingBlock: '16',
		paddingInline: '16',
	})

	export const skeletonRow = style({
		backgroundColor: 'container.strong',
		borderRadius: '3xs',
		height: '10px !custom',
	})

	export const panelEmpty = style({
		color: 'content.tertiary',
		paddingBlock: '20',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const panelError = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		paddingBlock: '16',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const panelErrorTitle = style({ color: 'content.negative' })

	export const panelErrorMessage = style({
		color: 'content.tertiary',
		fontVariantNumeric: 'tabular-nums',
		typography: 'body.b2',
		wordBreak: 'break-all',
	})

	export const failure = style({
		alignItems: 'flex-start',
		backgroundColor: 'container.negative',
		borderRadius: 'xs',
		display: 'flex',
		gap: '12',
		padding: '16',
	})

	export const failureIcon = style({
		color: 'content.negative',
		flexShrink: 0,
		height: '16',
		marginTop: '2',
		width: '16',
	})

	export const failureBody = style({
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const failureTitle = style({
		color: 'content.negative',
		margin: 'none',
		typography: 'body.b2Strong',
	})

	export const failureHint = style({
		color: 'content.secondary',
		margin: 'none',
		typography: 'body.b2',
	})

	export const failureMessages = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
	})

	export const failureMessage = style({
		backgroundColor: 'container.regular',
		borderRadius: '2xs',
		color: 'content.secondary',
		display: 'block',
		paddingBlock: '8',
		paddingInline: '12',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const failureRetry = style({ marginTop: '4' })
}
