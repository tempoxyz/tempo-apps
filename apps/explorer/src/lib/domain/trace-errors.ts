import {
	decodeErrorResult,
	parseAbi,
	parseAbiItem,
	type Abi,
	type AbiParameter,
	type Hex,
} from 'viem'
import { formatAbiValue } from '#lib/domain/contracts'
import type { CallTrace } from '#lib/queries'

const standardErrorAbi = parseAbi([
	'error Error(string)',
	'error Panic(uint256)',
])

const PANIC_REASONS: Record<string, string> = {
	'1': 'assertion failed',
	'11': 'arithmetic overflow or underflow',
	'12': 'division or modulo by zero',
	'21': 'invalid enum value',
	'32': 'array index out of bounds',
	'41': 'out of memory',
	'51': 'uninitialized function pointer',
}

export type DecodedTraceError = {
	name: string
	args: readonly unknown[]
	/** Parameter definitions for `args`, when the matching ABI item was found. */
	inputs?: readonly AbiParameter[]
	signature?: string
	panicReason?: string
	raw: Hex
	/** True when nothing decoded and `name` is just the raw revert bytes. */
	undecoded?: boolean
}

export function getRevertData(trace: CallTrace): Hex | null {
	if (trace.output && trace.output !== '0x') return trace.output
	const raw = trace.revertReason || trace.error
	const [data] = raw?.match(/0x[0-9a-fA-F]+/) ?? []
	return data ? (data as Hex) : null
}

export function decodeTraceError(args: {
	trace: CallTrace
	abi?: Abi | null
	signature?: string | null
}): DecodedTraceError | undefined {
	const raw = getRevertData(args.trace)
	if (!raw || raw.length < 10) return undefined

	const candidates: Array<{ abi: Abi; signature?: string }> = [
		{ abi: standardErrorAbi },
	]
	if (args.abi) candidates.push({ abi: args.abi })
	if (args.signature) {
		try {
			const item = parseAbiItem(`error ${args.signature}`)
			candidates.push({ abi: [item] as Abi, signature: args.signature })
		} catch {}
	}

	for (const candidate of candidates) {
		try {
			const decoded = decodeErrorResult({ abi: candidate.abi, data: raw })
			const panicCode =
				decoded.errorName === 'Panic' && typeof decoded.args?.[0] === 'bigint'
					? decoded.args[0].toString(16)
					: undefined
			const abiItem = candidate.abi.find(
				(item) => item.type === 'error' && item.name === decoded.errorName,
			)
			const resolvedSignature =
				candidate.signature ??
				(abiItem?.type === 'error'
					? `${abiItem.name}(${abiItem.inputs.map((input) => input.type).join(',')})`
					: undefined)
			return {
				name: decoded.errorName,
				args: decoded.args ?? [],
				inputs: abiItem?.type === 'error' ? abiItem.inputs : undefined,
				signature: resolvedSignature,
				panicReason: panicCode ? PANIC_REASONS[panicCode] : undefined,
				raw,
			}
		} catch {}
	}
	return { name: raw, args: [], raw, undecoded: true }
}

export function formatDecodedTraceError(error: DecodedTraceError): string {
	if (error.panicReason) return `Panic(${error.panicReason})`
	const args = error.args.map((value) => formatAbiValue(value)).join(', ')
	return args ? `${error.name}(${args})` : error.name
}

/**
 * Short form for the trace tree. The full decode with named arguments lives in
 * the verdict, so inlining every argument here just makes the tree unreadable.
 */
export function formatDecodedTraceErrorShort(error: DecodedTraceError): string {
	if (error.panicReason) return `Panic: ${error.panicReason}`
	if (error.undecoded) return 'reverted'
	if (error.name === 'Error' && typeof error.args[0] === 'string')
		return error.args[0]
	return error.name
}

export function findDeepestFailurePath(trace: CallTrace): number[] | null {
	let deepest: number[] | null = null
	function visit(node: CallTrace, path: number[]) {
		if (node.error || node.revertReason) {
			if (!deepest || path.length > deepest.length) deepest = path
		}
		node.calls?.forEach((child, index) => {
			visit(child, [...path, index])
		})
	}
	visit(trace, [])
	return deepest
}
