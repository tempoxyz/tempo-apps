import * as Value from 'ox/Value'
import type { Address } from 'ox'
import type { AbiParameter } from 'viem'
import { formatAbiValue } from '#lib/domain/contracts'
import type { DecodedTraceError } from '#lib/domain/trace-errors'
import { isTip20Address } from '#lib/domain/tip20'
import { PriceFormatter } from '#lib/formatting'

const MAX_UINT256 = (1n << 256n) - 1n
const MAX_UINT128 = (1n << 128n) - 1n
const MAX_UINT64 = (1n << 64n) - 1n

/** Argument names that plausibly carry a token amount rather than an id or count. */
const AMOUNT_NAMES =
	/amount|balance|value|required|available|allowance|supply|owed|deficit|shortfall|limit/i

export type FormattedErrorArg = {
	label: string
	value: string
	/** Longer-form original, shown on hover when `value` is an abbreviation. */
	title?: string
	/** Secondary annotation rendered beside the value, e.g. "max uint256". */
	note?: string
}

/**
 * Turns a decoded custom error into labelled rows for the verdict block.
 *
 * Amounts are formatted with the reverting token's decimals when we can
 * reasonably infer that an argument is an amount — a raw 78-digit integer
 * hides the argument sitting next to it.
 */
export function formatTraceErrorArgs(params: {
	error: DecodedTraceError
	/** Address of the frame that reverted, used to infer token decimals. */
	contract?: Address.Address | undefined
	tokenMetadata?:
		| Record<string, { symbol?: string; decimals?: number } | undefined>
		| undefined
}): FormattedErrorArg[] {
	const { error, contract, tokenMetadata } = params
	if (error.undecoded) return []

	const metadata =
		contract && isTip20Address(contract)
			? (tokenMetadata?.[contract.toLowerCase()] ?? tokenMetadata?.[contract])
			: undefined

	return error.args.map((value, index) => {
		const input = error.inputs?.[index]
		const label = argLabel(input, index)
		return {
			label,
			...formatArgValue({ value, input, label, metadata }),
		}
	})
}

function argLabel(input: AbiParameter | undefined, index: number): string {
	if (input?.name) return input.name
	if (input?.type) return `${input.type} ${index}`
	return `arg ${index}`
}

function formatArgValue(params: {
	value: unknown
	input: AbiParameter | undefined
	label: string
	metadata: { symbol?: string; decimals?: number } | undefined
}): Omit<FormattedErrorArg, 'label'> {
	const { value, input, label, metadata } = params

	if (typeof value !== 'bigint') return { value: formatAbiValue(value) }

	const sentinel = sentinelName(value)
	if (sentinel)
		return {
			value: abbreviateBigint(value),
			title: value.toString(),
			note: sentinel,
		}

	const looksLikeAmount =
		metadata?.decimals !== undefined &&
		(input?.type?.startsWith('uint') ?? false) &&
		AMOUNT_NAMES.test(label)

	if (looksLikeAmount && metadata?.decimals !== undefined) {
		const formatted = PriceFormatter.formatAmount(
			Value.format(value, metadata.decimals),
		)
		return {
			value: metadata.symbol ? `${formatted} ${metadata.symbol}` : formatted,
			title: `${value.toString()} (raw)`,
		}
	}

	return { value: value.toLocaleString() }
}

function sentinelName(value: bigint): string | undefined {
	if (value === MAX_UINT256) return 'max uint256'
	if (value === MAX_UINT128) return 'max uint128'
	if (value === MAX_UINT64) return 'max uint64'
	return undefined
}

/** `1157920892373…639935` — enough to recognise, short enough to sit in a row. */
function abbreviateBigint(value: bigint): string {
	const text = value.toString()
	if (text.length <= 20) return text
	return `${text.slice(0, 13)}…${text.slice(-6)}`
}
