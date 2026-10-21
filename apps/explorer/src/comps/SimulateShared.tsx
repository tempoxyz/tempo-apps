/** Displays, states, and formatting shared by the simulator's panes. */

import {
	Callout,
	Empty,
	formatHex,
	Skeleton,
	style,
	variants,
} from '@tempoxyz/ds'
import * as OxAddress from 'ox/Address'
import * as OxHex from 'ox/Hex'
import type * as React from 'react'
import type { Abi } from 'viem'
import { decodeFunctionData } from 'viem'
import { formatAbiValue, getContractInfo } from '#lib/domain/contracts'
import type { FormState } from '#lib/domain/simulate-calls'
import { SimulationApiError } from '#lib/queries'
import type { TxTraceTree } from './TxTraceTree'

/* -------------------------------------------------------------------------- */
/* Gas                                                                        */
/* -------------------------------------------------------------------------- */

/** Share of the limit a run consumed, as a percentage. */
export function gasPercent(used: bigint, limit: bigint): number {
	return limit > 0n ? Number((used * 10_000n) / limit) / 100 : 0
}

/** `0.45%`, `1%`, `<0.01%`, and never `0%` for a call that used gas. */
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

/**
 * Placeholder lines while a panel loads. Panels reach the card's edges, so
 * they pad their own content; `inset={false}` drops that padding for content
 * that sits inside the card's padding.
 */
export function PanelSkeleton(props: {
	rows: number
	inset?: boolean | undefined
}): React.JSX.Element {
	return (
		<div {...styles.skeleton({ inset: props.inset ?? true })}>
			{Array.from({ length: props.rows }, (_, index) => (
				<Skeleton
					key={index}
					{...styles.skeletonRow({
						style: { width: `${88 - (index % 3) * 14}%` },
					})}
				/>
			))}
		</div>
	)
}

/** A panel with nothing to show: what is missing, and why. */
export function PanelEmpty(props: {
	title: string
	description: string
}): React.JSX.Element {
	return (
		<Empty.Root>
			<Empty.Title>{props.title}</Empty.Title>
			<Empty.Description>{props.description}</Empty.Description>
		</Empty.Root>
	)
}

/** One panel's request failed; the others may still have loaded. */
export function PanelError(props: {
	/** What failed to load, such as `the call trace`. */
	subject: string
	error: Error
}): React.JSX.Element {
	const rateLimited =
		props.error instanceof SimulationApiError && props.error.status === 429
	return (
		<div {...styles.panelError()}>
			<Callout intent="negative">
				<Callout.Icon />
				<Callout.Content>
					{rateLimited
						? `Couldn't load ${props.subject}: too many simulations in a short window. Wait a few seconds, then run it again.`
						: `Couldn't load ${props.subject}. ${props.error.message}`}
				</Callout.Content>
			</Callout>
		</div>
	)
}

/**
 * Whole-simulation failure: one message, not one per panel. The panels share
 * one endpoint and one node, so anything wrong with the request fails them all
 * identically. It leads with what the reader can do about it.
 */
export function SimulationFailure(props: {
	errors: Error[]
	onRetry: () => void
}): React.JSX.Element {
	const status = props.errors.find(
		(error): error is SimulationApiError => error instanceof SimulationApiError,
	)?.status
	const messages = [...new Set(props.errors.map((error) => error.message))]

	return (
		<Callout intent="negative">
			<Callout.Icon />
			<Callout.Content>
				{describeFailure(status)}
				{messages.map((message) => (
					<span key={message} {...styles.failureMessage()}>
						{message}
					</span>
				))}
			</Callout.Content>
			<Callout.Action onClick={props.onRetry}>Try again</Callout.Action>
		</Callout>
	)
}

function describeFailure(status: number | undefined): string {
	if (status === 429)
		return 'Too many simulations in a short window. Wait a few seconds, then try again.'
	if (status === 504)
		return 'The node took too long to trace this call. Lower the gas limit or pin a block, then try again.'
	if (status === 400)
		return 'The request was rejected before it reached the node. Check the addresses, calldata, and gas limit.'
	return 'The node rejected this simulation, so nothing was traced. Check that the target supports the call and that the block still has state.'
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Longest argument list worth inlining in the summary. Past this the count
 * says more than a row of truncated values.
 */
const MAX_SUMMARY_ARG_CHARS = 32

/** `0xdEaD…dEaD → pathUSD.transfer(0x…0002, …)`, or `→ 2 calls`. */
export function describeCall(form: FormState, abi: Abi | undefined): string {
	const first = form.calls[0]
	if (!first || (!first.to.trim() && !first.data.trim())) return 'New call'

	const from = OxAddress.validate(form.from)
		? formatHex(form.from)
		: form.from || 'anyone'

	if (form.calls.length > 1) return `${from} → ${form.calls.length} calls`

	// A resolved name is shorter and says more than the address it stands for.
	const to = OxAddress.validate(first.to)
		? (getContractInfo(first.to as OxAddress.Address)?.name ??
			formatHex(first.to))
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
			// Unknown selector: the hex form above is a fine fallback.
		}
	}

	return `${from} → ${to}.${call}`
}

function shorten(value: string): string {
	if (OxHex.validate(value) && value.length > 14) return formatHex(value)
	if (value.length <= 14) return value
	return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function callLabel(node: TxTraceTree.Node): string {
	const contract =
		node.contractName ?? (node.trace.to ? formatHex(node.trace.to) : 'contract')
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

namespace styles {
	export const skeleton = variants({
		base: {
			display: 'flex',
			flexDirection: 'column',
			gap: '8',
			paddingBlock: '16',
		},
		defaultVariants: { inset: true },
		variants: {
			inset: { false: {}, true: { paddingInline: '16' } },
		},
	})

	// Skeleton owns the fill, radius, and sweep; an empty one needs a size.
	export const skeletonRow = style({ height: '12' })

	export const panelError = style({ padding: '16' })

	// Node errors run long; each takes its own line and wraps.
	export const failureMessage = style({
		display: 'block',
		marginTop: '4',
		overflowWrap: 'anywhere',
		typography: 'label.13.mono',
	})
}
