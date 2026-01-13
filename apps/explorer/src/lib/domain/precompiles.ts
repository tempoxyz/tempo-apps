import type { Hex } from 'viem'

export type DecodedPrecompile = {
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

// BLS12-381 G1 point: 128 bytes (x: 64 bytes, y: 64 bytes)
// BLS12-381 G2 point: 256 bytes (x: 128 bytes as c0+c1, y: 128 bytes as c0+c1)

function decodeBls12G1Add(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	const inputLen = (input.length - 2) / 2
	const params =
		inputLen >= 256 ? '2 G1 points (256 bytes)' : formatBytes(input)
	const outputLen = output ? (output.length - 2) / 2 : 0
	return {
		params,
		decodedOutput: outputLen === 128 ? 'G1 point (128 bytes)' : undefined,
	}
}

function decodeBls12G1Msm(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	const inputLen = (input.length - 2) / 2
	// Each element is 160 bytes (32-byte scalar + 128-byte G1 point)
	const numElements = Math.floor(inputLen / 160)
	const params =
		numElements > 0 ? `${numElements} element(s)` : formatBytes(input)
	const outputLen = output ? (output.length - 2) / 2 : 0
	return {
		params,
		decodedOutput: outputLen === 128 ? 'G1 point (128 bytes)' : undefined,
	}
}

function decodeBls12G2Add(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	const inputLen = (input.length - 2) / 2
	const params =
		inputLen >= 512 ? '2 G2 points (512 bytes)' : formatBytes(input)
	const outputLen = output ? (output.length - 2) / 2 : 0
	return {
		params,
		decodedOutput: outputLen === 256 ? 'G2 point (256 bytes)' : undefined,
	}
}

function decodeBls12G2Msm(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	const inputLen = (input.length - 2) / 2
	// Each element is 288 bytes (32-byte scalar + 256-byte G2 point)
	const numElements = Math.floor(inputLen / 288)
	const params =
		numElements > 0 ? `${numElements} element(s)` : formatBytes(input)
	const outputLen = output ? (output.length - 2) / 2 : 0
	return {
		params,
		decodedOutput: outputLen === 256 ? 'G2 point (256 bytes)' : undefined,
	}
}

function decodeBls12PairingCheck(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	const inputLen = (input.length - 2) / 2
	// Each pair is 384 bytes (128-byte G1 point + 256-byte G2 point)
	const numPairs = Math.floor(inputLen / 384)
	const params = numPairs > 0 ? `${numPairs} pair(s)` : 'empty'
	let decodedOutput: string | undefined
	if (output && output.length >= 66) {
		const success = bytesToBigInt(output, 0, 32) === 1n
		decodedOutput = success ? 'true' : 'false'
	}
	return { params, decodedOutput }
}

function decodeBls12MapFpToG1(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	const inputLen = (input.length - 2) / 2
	const params = inputLen >= 64 ? 'Fp element (64 bytes)' : formatBytes(input)
	const outputLen = output ? (output.length - 2) / 2 : 0
	return {
		params,
		decodedOutput: outputLen === 128 ? 'G1 point (128 bytes)' : undefined,
	}
}

function decodeBls12MapFp2ToG2(
	input: Hex,
	output: Hex | undefined,
): Partial<DecodedPrecompile> {
	const inputLen = (input.length - 2) / 2
	const params =
		inputLen >= 128 ? 'Fp2 element (128 bytes)' : formatBytes(input)
	const outputLen = output ? (output.length - 2) / 2 : 0
	return {
		params,
		decodedOutput: outputLen === 256 ? 'G2 point (256 bytes)' : undefined,
	}
}

type PrecompileDecoder = {
	name: string
	decode: (input: Hex, output: Hex | undefined) => Partial<DecodedPrecompile>
}

const precompileDecoders: Record<string, PrecompileDecoder> = {
	'0x0000000000000000000000000000000000000001': {
		name: 'ecRecover',
		decode: decodeEcRecover,
	},
	'0x0000000000000000000000000000000000000002': {
		name: 'sha256',
		decode: decodeSha256,
	},
	'0x0000000000000000000000000000000000000003': {
		name: 'ripemd160',
		decode: decodeRipemd160,
	},
	'0x0000000000000000000000000000000000000004': {
		name: 'identity',
		decode: decodeIdentity,
	},
	'0x0000000000000000000000000000000000000005': {
		name: 'modexp',
		decode: decodeModexp,
	},
	'0x0000000000000000000000000000000000000006': {
		name: 'ecAdd',
		decode: decodeEcAdd,
	},
	'0x0000000000000000000000000000000000000007': {
		name: 'ecMul',
		decode: decodeEcMul,
	},
	'0x0000000000000000000000000000000000000008': {
		name: 'ecPairing',
		decode: decodeEcPairing,
	},
	'0x0000000000000000000000000000000000000009': {
		name: 'blake2f',
		decode: decodeBlake2f,
	},
	'0x000000000000000000000000000000000000000a': {
		name: 'pointEvaluation',
		decode: decodePointEvaluation,
	},
	// Prague BLS12-381 precompiles (EIP-2537)
	'0x000000000000000000000000000000000000000b': {
		name: 'bls12G1Add',
		decode: decodeBls12G1Add,
	},
	'0x000000000000000000000000000000000000000c': {
		name: 'bls12G1Msm',
		decode: decodeBls12G1Msm,
	},
	'0x000000000000000000000000000000000000000d': {
		name: 'bls12G2Add',
		decode: decodeBls12G2Add,
	},
	'0x000000000000000000000000000000000000000e': {
		name: 'bls12G2Msm',
		decode: decodeBls12G2Msm,
	},
	'0x000000000000000000000000000000000000000f': {
		name: 'bls12PairingCheck',
		decode: decodeBls12PairingCheck,
	},
	'0x0000000000000000000000000000000000000010': {
		name: 'bls12MapFpToG1',
		decode: decodeBls12MapFpToG1,
	},
	'0x0000000000000000000000000000000000000011': {
		name: 'bls12MapFp2ToG2',
		decode: decodeBls12MapFp2ToG2,
	},
}

/**
 * Decode a precompile call. Returns undefined if the address is not a known precompile.
 */
export function decodePrecompile(
	address: string,
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile | undefined {
	const decoder = precompileDecoders[address.toLowerCase()]
	if (!decoder) return undefined

	const decoded = decoder.decode(input, output)
	return {
		functionName: decoder.name,
		params: decoded.params,
		decodedOutput: decoded.decodedOutput,
	}
}
