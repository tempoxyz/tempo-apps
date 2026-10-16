/** Shared simulator controls use Tempo Design System type scales and semantic
 * colors. Pilat is the UI face; explicit code and hash values use JetBrains Mono.
 */

import {
	Alert,
	InlineCode,
	KeyboardKey,
	Progress,
	style,
	vars,
} from '@tempoxyz/ds/platform'
import { AlertCircle } from '@tempoxyz/ds/platform/icons'
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
import { animatePulse } from '#styles/explorer'
import type { TxTraceTree } from './TxTraceTree'

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Label above a control. The label names the control with id `htmlFor`; the
 * hint, when there is one, has the id `fieldHintId(htmlFor)` so the control
 * can point `aria-describedby` at it.
 */
export function Field(props: Field.Props): React.JSX.Element {
	return (
		<div {...styles.field()}>
			<div {...styles.fieldHeader()}>
				<label htmlFor={props.htmlFor} {...styles.fieldLabel()}>
					{props.label}
				</label>
				{props.action}
			</div>
			{props.children}
			{props.hint &&
				(props.invalid ? (
					<ErrorText id={fieldHintId(props.htmlFor)}>{props.hint}</ErrorText>
				) : (
					<span id={fieldHintId(props.htmlFor)} {...styles.fieldHint()}>
						{props.hint}
					</span>
				))}
		</div>
	)
}

export declare namespace Field {
	interface Props {
		label: React.ReactNode
		/** Id of the control the label names. */
		htmlFor: string
		children: React.ReactNode
		/** Right-aligned control on the label line — a mode toggle, a link. */
		action?: React.ReactNode
		hint?: React.ReactNode
		invalid?: boolean
	}
}

export function fieldHintId(htmlFor: string): string {
	return `${htmlFor}-hint`
}

/**
 * An inline error. Status colours fail contrast as text in the light theme,
 * so the text stays primary and the icon carries the tone.
 */
export function ErrorText(props: {
	children: React.ReactNode
	id?: string | undefined
}): React.JSX.Element {
	return (
		<span id={props.id} {...styles.errorText()}>
			<AlertCircle {...styles.errorIcon()} />
			<span>{props.children}</span>
		</span>
	)
}

/**
 * A keyboard shortcut drawn inside a primary button. The button is an inverse
 * ground, so the key takes the inverse set to stay legible. Hidden from
 * assistive tech: the button announces it through `aria-keyshortcuts`.
 */
export function ButtonShortcut(props: {
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<KeyboardKey aria-hidden {...cx(vars({ set: 'inverse' }))}>
			{props.children}
		</KeyboardKey>
	)
}

/* -------------------------------------------------------------------------- */
/* Data display                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Gas used against the limit it ran under.
 *
 * A bare "273,270 gas" answers nothing — the actionable question is whether
 * the call is anywhere near running out, which is the ratio.
 */
export function GasMeter(props: GasMeter.Props): React.JSX.Element {
	const pct = gasPercent(props.used, props.limit)
	return (
		<Progress
			label={
				<span {...styles.gasMeterLabel()}>
					<span>Gas used</span>
					<GasRatio used={props.used} limit={props.limit} />
				</span>
			}
			showValue={false}
			value={Math.min(pct, 100)}
			style={{ width: '100%' }}
		/>
	)
}

export declare namespace GasMeter {
	interface Props {
		used: bigint
		limit: bigint
	}
}

/** Share of the limit a run consumed, as a percentage. */
export function gasPercent(used: bigint, limit: bigint): number {
	return limit > 0n ? Number((used * 10_000n) / limit) / 100 : 0
}

/**
 * `used / limit (pct)` — the transaction page's format, one implementation.
 * It takes its type size from the surrounding text.
 */
export function GasRatio(props: {
	used: bigint
	limit: bigint
}): React.JSX.Element {
	const pct = gasPercent(props.used, props.limit)
	return (
		<span {...styles.gasRatio()}>
			<span {...styles.gasRatioUsed()}>{props.used.toLocaleString()}</span>
			<span {...styles.gasRatioLimit()}>
				{' / '}
				{props.limit.toLocaleString()}
			</span>
			<span {...styles.gasRatioPercent()}>({formatGasPercent(pct)})</span>
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
		<div {...cx(styles.skeleton(), animatePulse())}>
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
			<Alert
				tone="negative"
				title={rateLimited ? 'Rate limited' : props.title}
				description={props.error.message}
				style={{ width: '100%' }}
			/>
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
		<Alert
			tone="negative"
			title={title}
			description={
				<>
					{hint}
					{messages.map((message) => (
						<span key={message} {...styles.failureMessage()}>
							{/* Node errors run long; let them wrap inside the alert. */}
							<InlineCode
								style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}
							>
								{message}
							</InlineCode>
						</span>
					))}
				</>
			}
			action={{ label: 'Try again', onClick: props.onRetry }}
			style={{ width: '100%' }}
		/>
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

/**
 * Longest argument list worth inlining in the header.
 *
 * Two short arguments read as a sentence. Six truncated hashes read as noise —
 * every one of them is elided to `0x…` anyway, so the list costs the width of
 * the whole header and tells you nothing you could act on. Past this the count
 * says more than the values.
 */
const MAX_SUMMARY_ARG_CHARS = 32

/** `0xdEaD…dEaD → pathUSD.transfer(0x…0002, …)`, or `→ 2 calls`. */
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
		gap: '8',
		minWidth: '0 !custom',
	})

	export const fieldHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
	})

	export const fieldLabel = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const fieldHint = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const errorText = style({
		alignItems: 'flex-start',
		color: 'content.primary',
		display: 'flex',
		gap: '4',
		typography: 'body.b3',
	})

	export const errorIcon = style({
		color: 'content.negative',
		flexShrink: 0,
		height: '16',
		width: '16',
	})

	export const gasMeterLabel = style({
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
	})

	export const gasRatio = style({ fontVariantNumeric: 'tabular-nums' })

	export const gasRatioUsed = style({ color: 'content.primary' })

	export const gasRatioLimit = style({ color: 'content.secondary' })

	export const gasRatioPercent = style({
		color: 'content.secondary',
		marginLeft: '4',
	})

	export const skeleton = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		padding: '16',
	})

	export const skeletonRow = style({
		backgroundColor: 'container.strong',
		borderRadius: '3xs',
		height: '12',
	})

	export const panelEmpty = style({
		color: 'content.secondary',
		paddingBlock: '20',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const panelError = style({ padding: '16' })

	export const failureMessage = style({ display: 'block', marginTop: '8' })
}
