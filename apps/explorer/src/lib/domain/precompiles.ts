import type { Hex } from 'viem'
import { type PrecompileInfo, precompileRegistry } from './contracts'

export type DecodedPrecompile = {
	name: string
	functionName: string
	params?: string
	decodedOutput?: string
}

function sliceBytes(data: Hex, start: number, end?: number): Hex {
	const startHex = 2 + start * 2
	const endHex = end !== undefined ? 2 + end * 2 : undefined
	return `0x${data.slice(startHex, endHex)}` as Hex
}

function bytesToBigInt(data: Hex, start: number, length: number): bigint {
	const slice = sliceBytes(data, start, start + length)
	return BigInt(slice)
}

function formatU256(value: bigint): string {
	return value.toString()
}

function formatBytes(data: Hex): string {
	if (data.length <= 66) return data
	return `${data.slice(0, 10)}...${data.slice(-8)} (${(data.length - 2) / 2} bytes)`
}

function decodeEcRecover(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	try {
		if (input.length < 2 + 128 * 2) {
			return { params: formatBytes(input) }
		}
		const hash = sliceBytes(input, 0, 32)
		const v = bytesToBigInt(input, 32, 32)
		const r = sliceBytes(input, 64, 96)
		const s = sliceBytes(input, 96, 128)
		const params = `hash: ${hash}, v: ${v}, r: ${r}, s: ${s}`
		let decodedOutput: string | undefined
		if (output && output.length >= 66) {
			const addr = sliceBytes(output, 12, 32)
			decodedOutput = addr
		}
		return { params, decodedOutput }
	} catch {
		return { params: formatBytes(input) }
	}
}

function decodeSha256(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	return {
		params: `data: ${formatBytes(input)}`,
		decodedOutput: output && output !== '0x' ? output : undefined,
	}
}

function decodeRipemd160(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	return {
		params: `data: ${formatBytes(input)}`,
		decodedOutput:
			output && output !== '0x' ? sliceBytes(output, 12, 32) : undefined,
	}
}

function decodeIdentity(
	input: Hex,
	_output: Hex | undefined,
): Partial<DecodedPrecompile> {
	return { params: `data: ${formatBytes(input)}` }
}

function decodeModexp(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	try {
		if (input.length < 2 + 96 * 2) {
			return { params: formatBytes(input) }
		}
		const bSize = Number(bytesToBigInt(input, 0, 32))
		const eSize = Number(bytesToBigInt(input, 32, 32))
		const mSize = Number(bytesToBigInt(input, 64, 32))
		const params = `Bsize: ${bSize}, Esize: ${eSize}, Msize: ${mSize}`
		return {
			params,
			decodedOutput:
				output && output !== '0x' ? formatBytes(output) : undefined,
		}
	} catch {
		return { params: formatBytes(input) }
	}
}

function decodeEcAdd(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	try {
		if (input.length < 2 + 128 * 2) {
			return { params: formatBytes(input) }
		}
		const x1 = formatU256(bytesToBigInt(input, 0, 32))
		const y1 = formatU256(bytesToBigInt(input, 32, 32))
		const x2 = formatU256(bytesToBigInt(input, 64, 32))
		const y2 = formatU256(bytesToBigInt(input, 96, 32))
		const params = `x1: ${x1}, y1: ${y1}, x2: ${x2}, y2: ${y2}`
		let decodedOutput: string | undefined
		if (output && output.length >= 2 + 64 * 2) {
			const xOut = formatU256(bytesToBigInt(output, 0, 32))
			const yOut = formatU256(bytesToBigInt(output, 32, 32))
			decodedOutput = `x: ${xOut}, y: ${yOut}`
		}
		return { params, decodedOutput }
	} catch {
		return { params: formatBytes(input) }
	}
}

function decodeEcMul(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	try {
		if (input.length < 2 + 96 * 2) {
			return { params: formatBytes(input) }
		}
		const x1 = formatU256(bytesToBigInt(input, 0, 32))
		const y1 = formatU256(bytesToBigInt(input, 32, 32))
		const s = formatU256(bytesToBigInt(input, 64, 32))
		const params = `x1: ${x1}, y1: ${y1}, s: ${s}`
		let decodedOutput: string | undefined
		if (output && output.length >= 2 + 64 * 2) {
			const xOut = formatU256(bytesToBigInt(output, 0, 32))
			const yOut = formatU256(bytesToBigInt(output, 32, 32))
			decodedOutput = `x: ${xOut}, y: ${yOut}`
		}
		return { params, decodedOutput }
	} catch {
		return { params: formatBytes(input) }
	}
}

function decodeEcPairing(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	const inputLen = (input.length - 2) / 2
	const numPairs = Math.floor(inputLen / 192)
	const params = numPairs > 0 ? `${numPairs} pair(s)` : 'empty'
	let decodedOutput: string | undefined
	if (output && output.length >= 66) {
		const success = bytesToBigInt(output, 0, 32) === 1n
		decodedOutput = success ? 'true' : 'false'
	}
	return { params, decodedOutput }
}

function decodeBlake2f(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	try {
		if (input.length < 2 + 213 * 2) {
			return { params: formatBytes(input) }
		}
		const roundsHex = sliceBytes(input, 0, 4)
		const rounds = Number(BigInt(roundsHex))
		const f = input.slice(2 + 212 * 2, 2 + 213 * 2) === '01'
		const params = `rounds: ${rounds}, f: ${f}`
		return {
			params,
			decodedOutput:
				output && output !== '0x' ? formatBytes(output) : undefined,
		}
	} catch {
		return { params: formatBytes(input) }
	}
}

function decodePointEvaluation(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	try {
		if (input.length < 2 + 192 * 2) {
			return { params: formatBytes(input) }
		}
		const versionedHash = sliceBytes(input, 0, 32)
		const z = sliceBytes(input, 32, 64)
		const y = sliceBytes(input, 64, 96)
		const params = `versionedHash: ${versionedHash}, z: ${z}, y: ${y}`
		return {
			params,
			decodedOutput:
				output && output !== '0x' ? formatBytes(output) : undefined,
		}
	} catch {
		return { params: formatBytes(input) }
	}
}

const decoders: Record<
	string,
	(input: Hex, output: Hex | undefined) => Partial<DecodedPrecompile>
> = {
	'0x0000000000000000000000000000000000000001': decodeEcRecover,
	'0x0000000000000000000000000000000000000002': decodeSha256,
	'0x0000000000000000000000000000000000000003': decodeRipemd160,
	'0x0000000000000000000000000000000000000004': decodeIdentity,
	'0x0000000000000000000000000000000000000005': decodeModexp,
	'0x0000000000000000000000000000000000000006': decodeEcAdd,
	'0x0000000000000000000000000000000000000007': decodeEcMul,
	'0x0000000000000000000000000000000000000008': decodeEcPairing,
	'0x0000000000000000000000000000000000000009': decodeBlake2f,
	'0x000000000000000000000000000000000000000a': decodePointEvaluation,
}

/**
 * Decode a precompile call. Returns undefined if the address is not a known precompile.
 */
export function decodePrecompile(
	address: string,
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile | undefined {
	const lowerAddress = address.toLowerCase()
	const info = precompileRegistry.get(lowerAddress as `0x${string}`)
	if (!info) return undefined

	const decoder = decoders[lowerAddress]
	const decoded = decoder?.(input, output) ?? {}

	return {
		name: info.name,
		functionName: info.name,
		params: decoded.params,
		decodedOutput: decoded.decodedOutput,
	}
}

/**
 * Get precompile info without decoding.
 */
export function getPrecompile(address: string): PrecompileInfo | undefined {
	return precompileRegistry.get(address.toLowerCase() as `0x${string}`)
}
