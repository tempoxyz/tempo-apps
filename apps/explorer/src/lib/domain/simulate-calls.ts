/**
 * The simulator's call list, its URL encoding, and the draft → input parse.
 *
 * Kept out of the route module so it stays free of React and icon imports and
 * can be unit tested — importing the route pulls in `~icons/*`, which the node
 * test environment cannot resolve.
 */

import * as OxAddress from 'ox/Address'
import * as OxHex from 'ox/Hex'
import { zeroAddress } from 'viem'
import type {
	SimulationBatchCall,
	SimulationInput,
} from '#lib/queries/simulate'

/** One entry per call. A single call is just a list of length one. */
export type CallDraft = {
	to: string
	data: string
	value: string
}

export const emptyCall: CallDraft = { to: '', data: '', value: '0' }

/** Everything the form owns before it is committed to the URL by Run. */
export type FormState = {
	from: string
	calls: CallDraft[]
	gas: string
	block: string
}

export const DEFAULT_GAS = '50000000'

/**
 * Calldata longer than this is dropped from the URL rather than truncated —
 * a link that reproduces a *different* call is worse than no link.
 */
export const MAX_URL_CALLDATA_BYTES = 3_000

/**
 * Calls after the first, for the `calls` search parameter.
 *
 * Returns the array rather than a JSON string on purpose: the router
 * JSON-parses search values, so a schema declared as `string` would reject its
 * own serialized output and take the route down — the trap `gas` fell into
 * when it round-tripped back as a number.
 */
export function serializeExtraCalls(
	calls: readonly CallDraft[],
): string[][] | undefined {
	if (calls.length < 2) return undefined
	return calls.slice(1).map((call) => [call.to, call.data, call.value])
}

export function parseExtraCalls(
	value: readonly (readonly string[])[] | undefined,
): CallDraft[] {
	if (!value) return []
	return value.flatMap((entry) =>
		entry[0]
			? [{ to: entry[0], data: entry[1] ?? '0x', value: entry[2] ?? '0' }]
			: [],
	)
}

/**
 * A complete, runnable input, or `null` when the draft is not there yet.
 *
 * An unset sender means "nobody in particular" — the zero address, matching
 * what `eth_call` does. Only `to` is genuinely required.
 */
export function parseForm(
	form: FormState,
	chainId: number,
	/**
	 * Block gas limit, used to keep a batch inside it.
	 *
	 * The gas field defaults to the whole block limit so a heavy single call
	 * never hits a fake out-of-gas. `eth_simulateV1` runs a batch as one block
	 * and applies the limit to *each* call, so two calls at the block limit ask
	 * for twice the block and the node rejects the bundle outright with
	 * "Block gas limit exceeded by the block's transactions" — every multi-call
	 * simulation failed with a 502 before this. Sharing the block between the
	 * calls is what the node can actually accommodate.
	 */
	blockGasLimit?: string | undefined,
): SimulationInput | null {
	if (chainId !== 4217 && chainId !== 42431 && chainId !== 31318) return null
	const from = form.from.trim() === '' ? zeroAddress : form.from.trim()
	if (
		!OxAddress.validate(from) ||
		!/^\d+$/.test(form.gas) ||
		(form.block !== 'latest' &&
			(!OxHex.validate(form.block) || OxHex.size(form.block) !== 32))
	)
		return null

	const calls: SimulationBatchCall[] = []
	for (const draft of form.calls) {
		const data = draft.data.trim() === '' ? '0x' : draft.data.trim()
		if (
			!OxAddress.validate(draft.to.trim()) ||
			!OxHex.validate(data) ||
			!/^\d+$/.test(draft.value)
		)
			return null
		calls.push({
			to: OxAddress.from(draft.to.trim()),
			data: data as OxHex.Hex,
			value: draft.value,
		})
	}

	const first = calls[0]
	if (!first) return null
	return {
		chainId,
		from: OxAddress.from(from),
		to: first.to,
		data: first.data,
		value: first.value,
		gas: shareGasAcrossCalls(form.gas, calls.length, blockGasLimit),
		block: form.block as 'latest' | OxHex.Hex,
		...(calls.length > 1 ? { calls } : {}),
	}
}

/**
 * Per-call gas that keeps `count` calls inside one block.
 *
 * Only ever lowers the value, and only when the bundle would not fit — a user
 * who typed a modest limit keeps exactly what they typed.
 */
export function shareGasAcrossCalls(
	gas: string,
	count: number,
	blockGasLimit: string | undefined,
): string {
	if (count <= 1 || !blockGasLimit || !/^\d+$/.test(blockGasLimit)) return gas
	const limit = BigInt(blockGasLimit)
	const requested = BigInt(gas)
	if (requested * BigInt(count) <= limit) return gas
	return (limit / BigInt(count)).toString()
}

/** Which fields of a draft are individually invalid, for on-blur validation. */
export function draftFieldErrors(form: FormState): {
	from: boolean
	gas: boolean
	block: boolean
	calls: Array<{ to: boolean; data: boolean; value: boolean }>
} {
	const from = form.from.trim()
	return {
		from: from !== '' && !OxAddress.validate(from),
		gas: !/^\d+$/.test(form.gas),
		block:
			form.block !== 'latest' &&
			(!OxHex.validate(form.block) || OxHex.size(form.block) !== 32),
		calls: form.calls.map((call) => ({
			to: call.to.trim() !== '' && !OxAddress.validate(call.to.trim()),
			// An empty field is *unfilled*, not wrong. Flagging `''` as invalid hex
			// is why the empty page used to arrive with a red outline already on.
			data: call.data.trim() !== '' && !OxHex.validate(call.data.trim()),
			value: !/^\d+$/.test(call.value),
		})),
	}
}
