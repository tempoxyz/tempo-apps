import type { Hex } from 'viem'

export type DecodedPrecompile = {
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
	return data
}

function decodeEcRecover(
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile {
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
		decodedOutput = sliceBytes(output, 12, 32)
	}
	return { params, decodedOutput }
}

function decodeSha256(input: Hex, output: Hex | undefined): DecodedPrecompile {
	return {
		params: `data: ${formatBytes(input)}`,
		decodedOutput: output && output !== '0x' ? output : undefined,
	}
}

function decodeRipemd160(
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile {
	return {
		params: `data: ${formatBytes(input)}`,
		decodedOutput:
			output && output !== '0x' ? sliceBytes(output, 12, 32) : undefined,
	}
}

function decodeIdentity(
	input: Hex,
	_output: Hex | undefined,
): DecodedPrecompile {
	return { params: `data: ${formatBytes(input)}` }
}

function decodeModexp(input: Hex, output: Hex | undefined): DecodedPrecompile {
	if (input.length < 2 + 96 * 2) {
		return { params: formatBytes(input) }
	}
	const bSize = Number(bytesToBigInt(input, 0, 32))
	const eSize = Number(bytesToBigInt(input, 32, 32))
	const mSize = Number(bytesToBigInt(input, 64, 32))
	const expectedLen = 96 + bSize + eSize + mSize
	if (input.length < 2 + expectedLen * 2) {
		return { params: formatBytes(input) }
	}
	const b = sliceBytes(input, 96, 96 + bSize)
	const e = sliceBytes(input, 96 + bSize, 96 + bSize + eSize)
	const m = sliceBytes(input, 96 + bSize + eSize, 96 + bSize + eSize + mSize)
	const params = `B: ${b}, E: ${e}, M: ${m}`
	return {
		params,
		decodedOutput: output && output !== '0x' ? formatBytes(output) : undefined,
	}
}

function decodeEcAdd(input: Hex, output: Hex | undefined): DecodedPrecompile {
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
}

function decodeEcMul(input: Hex, output: Hex | undefined): DecodedPrecompile {
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
}

function decodeEcPairing(
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile {
	const inputLen = (input.length - 2) / 2
	if (inputLen % 192 !== 0) {
		return { params: formatBytes(input) }
	}
	const numPairs = inputLen / 192
	const pairs: string[] = []
	for (let i = 0; i < numPairs; i++) {
		const offset = i * 192
		const x1 = formatU256(bytesToBigInt(input, offset, 32))
		const y1 = formatU256(bytesToBigInt(input, offset + 32, 32))
		const x2_c0 = formatU256(bytesToBigInt(input, offset + 64, 32))
		const x2_c1 = formatU256(bytesToBigInt(input, offset + 96, 32))
		const y2_c0 = formatU256(bytesToBigInt(input, offset + 128, 32))
		const y2_c1 = formatU256(bytesToBigInt(input, offset + 160, 32))
		pairs.push(
			`(x1: ${x1}, y1: ${y1}, x2: (${x2_c0}, ${x2_c1}), y2: (${y2_c0}, ${y2_c1}))`,
		)
	}
	const params = pairs.length > 0 ? pairs.join('; ') : 'empty'
	let decodedOutput: string | undefined
	if (output && output.length >= 66) {
		const success = bytesToBigInt(output, 0, 32) === 1n
		decodedOutput = success ? 'true' : 'false'
	}
	return { params, decodedOutput }
}

function decodeBlake2f(input: Hex, output: Hex | undefined): DecodedPrecompile {
	if (input.length < 2 + 213 * 2) {
		return { params: formatBytes(input) }
	}
	const roundsHex = sliceBytes(input, 0, 4)
	const rounds = Number(BigInt(roundsHex))
	const f = input.slice(2 + 212 * 2, 2 + 213 * 2) === '01'
	const params = `rounds: ${rounds}, f: ${f}`
	return {
		params,
		decodedOutput: output && output !== '0x' ? formatBytes(output) : undefined,
	}
}

function decodePointEvaluation(
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile {
	if (input.length < 2 + 192 * 2) {
		return { params: formatBytes(input) }
	}
	const versionedHash = sliceBytes(input, 0, 32)
	const z = sliceBytes(input, 32, 64)
	const y = sliceBytes(input, 64, 96)
	const params = `versionedHash: ${versionedHash}, z: ${z}, y: ${y}`
	return {
		params,
		decodedOutput: output && output !== '0x' ? formatBytes(output) : undefined,
	}
}

// BLS12-381 G1 point: 128 bytes (x: 64 bytes, y: 64 bytes)
// BLS12-381 G2 point: 256 bytes (x: 128 bytes as c0+c1, y: 128 bytes as c0+c1)

function decodeBls12G1Add(
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile {
	const inputLen = (input.length - 2) / 2
	if (inputLen !== 256) {
		return { params: formatBytes(input) }
	}
	const x1 = sliceBytes(input, 0, 64)
	const y1 = sliceBytes(input, 64, 128)
	const x2 = sliceBytes(input, 128, 192)
	const y2 = sliceBytes(input, 192, 256)
	const params = `x1: ${x1}, y1: ${y1}, x2: ${x2}, y2: ${y2}`
	let decodedOutput: string | undefined
	const outputLen = output ? (output.length - 2) / 2 : 0
	if (output && outputLen === 128) {
		const xOut = sliceBytes(output, 0, 64)
		const yOut = sliceBytes(output, 64, 128)
		decodedOutput = `x: ${xOut}, y: ${yOut}`
	}
	return { params, decodedOutput }
}

function decodeBls12G1Msm(
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile {
	const inputLen = (input.length - 2) / 2
	// Each element is 160 bytes (32-byte scalar + 128-byte G1 point).
	if (inputLen === 0 || inputLen % 160 !== 0) {
		return { params: formatBytes(input) }
	}
	const numElements = inputLen / 160
	const elements: string[] = []
	for (let i = 0; i < numElements; i++) {
		const offset = i * 160
		const scalar = sliceBytes(input, offset, offset + 32)
		const x = sliceBytes(input, offset + 32, offset + 96)
		const y = sliceBytes(input, offset + 96, offset + 160)
		elements.push(`(k: ${scalar}, x: ${x}, y: ${y})`)
	}
	const params = elements.join('; ')
	let decodedOutput: string | undefined
	const outputLen = output ? (output.length - 2) / 2 : 0
	if (output && outputLen === 128) {
		const xOut = sliceBytes(output, 0, 64)
		const yOut = sliceBytes(output, 64, 128)
		decodedOutput = `x: ${xOut}, y: ${yOut}`
	}
	return { params, decodedOutput }
}

function decodeBls12G2Add(
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile {
	const inputLen = (input.length - 2) / 2
	if (inputLen !== 512) {
		return { params: formatBytes(input) }
	}
	const x1_c0 = sliceBytes(input, 0, 64)
	const x1_c1 = sliceBytes(input, 64, 128)
	const y1_c0 = sliceBytes(input, 128, 192)
	const y1_c1 = sliceBytes(input, 192, 256)
	const x2_c0 = sliceBytes(input, 256, 320)
	const x2_c1 = sliceBytes(input, 320, 384)
	const y2_c0 = sliceBytes(input, 384, 448)
	const y2_c1 = sliceBytes(input, 448, 512)
	const params = `x1: (${x1_c0}, ${x1_c1}), y1: (${y1_c0}, ${y1_c1}), x2: (${x2_c0}, ${x2_c1}), y2: (${y2_c0}, ${y2_c1})`
	let decodedOutput: string | undefined
	const outputLen = output ? (output.length - 2) / 2 : 0
	if (output && outputLen === 256) {
		const xOut_c0 = sliceBytes(output, 0, 64)
		const xOut_c1 = sliceBytes(output, 64, 128)
		const yOut_c0 = sliceBytes(output, 128, 192)
		const yOut_c1 = sliceBytes(output, 192, 256)
		decodedOutput = `x: (${xOut_c0}, ${xOut_c1}), y: (${yOut_c0}, ${yOut_c1})`
	}
	return { params, decodedOutput }
}

function decodeBls12G2Msm(
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile {
	const inputLen = (input.length - 2) / 2
	// Each element is 288 bytes (32-byte scalar + 256-byte G2 point).
	if (inputLen === 0 || inputLen % 288 !== 0) {
		return { params: formatBytes(input) }
	}
	const numElements = inputLen / 288
	const elements: string[] = []
	for (let i = 0; i < numElements; i++) {
		const offset = i * 288
		const scalar = sliceBytes(input, offset, offset + 32)
		const x_c0 = sliceBytes(input, offset + 32, offset + 96)
		const x_c1 = sliceBytes(input, offset + 96, offset + 160)
		const y_c0 = sliceBytes(input, offset + 160, offset + 224)
		const y_c1 = sliceBytes(input, offset + 224, offset + 288)
		elements.push(
			`(k: ${scalar}, x: (${x_c0}, ${x_c1}), y: (${y_c0}, ${y_c1}))`,
		)
	}
	const params = elements.join('; ')
	let decodedOutput: string | undefined
	const outputLen = output ? (output.length - 2) / 2 : 0
	if (output && outputLen === 256) {
		const xOut_c0 = sliceBytes(output, 0, 64)
		const xOut_c1 = sliceBytes(output, 64, 128)
		const yOut_c0 = sliceBytes(output, 128, 192)
		const yOut_c1 = sliceBytes(output, 192, 256)
		decodedOutput = `x: (${xOut_c0}, ${xOut_c1}), y: (${yOut_c0}, ${yOut_c1})`
	}
	return { params, decodedOutput }
}

function decodeBls12PairingCheck(
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile {
	const inputLen = (input.length - 2) / 2
	// Each pair is 384 bytes (128-byte G1 point + 256-byte G2 point).
	if (inputLen % 384 !== 0) {
		return { params: formatBytes(input) }
	}
	const numPairs = inputLen / 384
	const pairs: string[] = []
	for (let i = 0; i < numPairs; i++) {
		const offset = i * 384
		const g1_x = sliceBytes(input, offset, offset + 64)
		const g1_y = sliceBytes(input, offset + 64, offset + 128)
		const g2_x_c0 = sliceBytes(input, offset + 128, offset + 192)
		const g2_x_c1 = sliceBytes(input, offset + 192, offset + 256)
		const g2_y_c0 = sliceBytes(input, offset + 256, offset + 320)
		const g2_y_c1 = sliceBytes(input, offset + 320, offset + 384)
		pairs.push(
			`(g1_x: ${g1_x}, g1_y: ${g1_y}, g2_x: (${g2_x_c0}, ${g2_x_c1}), g2_y: (${g2_y_c0}, ${g2_y_c1}))`,
		)
	}
	const params = pairs.length > 0 ? pairs.join('; ') : 'empty'
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
): DecodedPrecompile {
	const inputLen = (input.length - 2) / 2
	if (inputLen !== 64) {
		return { params: formatBytes(input) }
	}
	const params = sliceBytes(input, 0, 64)
	let decodedOutput: string | undefined
	const outputLen = output ? (output.length - 2) / 2 : 0
	if (output && outputLen === 128) {
		const xOut = sliceBytes(output, 0, 64)
		const yOut = sliceBytes(output, 64, 128)
		decodedOutput = `x: ${xOut}, y: ${yOut}`
	}
	return { params, decodedOutput }
}

function decodeBls12MapFp2ToG2(
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile {
	const inputLen = (input.length - 2) / 2
	if (inputLen !== 128) {
		return { params: formatBytes(input) }
	}
	const c0 = sliceBytes(input, 0, 64)
	const c1 = sliceBytes(input, 64, 128)
	const params = `c0: ${c0}, c1: ${c1}`
	let decodedOutput: string | undefined
	const outputLen = output ? (output.length - 2) / 2 : 0
	if (output && outputLen === 256) {
		const xOut_c0 = sliceBytes(output, 0, 64)
		const xOut_c1 = sliceBytes(output, 64, 128)
		const yOut_c0 = sliceBytes(output, 128, 192)
		const yOut_c1 = sliceBytes(output, 192, 256)
		decodedOutput = `x: (${xOut_c0}, ${xOut_c1}), y: (${yOut_c0}, ${yOut_c1})`
	}
	return { params, decodedOutput }
}

function decodeP256Verify(
	input: Hex,
	output: Hex | undefined,
): DecodedPrecompile {
	// Input: hash (32) + r (32) + s (32) + qx (32) + qy (32) = 160 bytes.
	if (input.length < 2 + 160 * 2) {
		return { params: formatBytes(input) }
	}
	const hash = sliceBytes(input, 0, 32)
	const r = sliceBytes(input, 32, 64)
	const s = sliceBytes(input, 64, 96)
	const params = `hash: ${hash}, r: ${r}, s: ${s}`
	let decodedOutput: string | undefined
	if (output && output.length >= 66) {
		const success = bytesToBigInt(output, 0, 32) === 1n
		decodedOutput = success ? 'true' : 'false'
	}
	return { params, decodedOutput }
}

type PrecompileDecoder = (
	input: Hex,
	output: Hex | undefined,
) => DecodedPrecompile

const precompileDecoders: Record<string, PrecompileDecoder> = {
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
	// Prague BLS12-381 precompiles (EIP-2537)
	'0x000000000000000000000000000000000000000b': decodeBls12G1Add,
	'0x000000000000000000000000000000000000000c': decodeBls12G1Msm,
	'0x000000000000000000000000000000000000000d': decodeBls12G2Add,
	'0x000000000000000000000000000000000000000e': decodeBls12G2Msm,
	'0x000000000000000000000000000000000000000f': decodeBls12PairingCheck,
	'0x0000000000000000000000000000000000000010': decodeBls12MapFpToG1,
	'0x0000000000000000000000000000000000000011': decodeBls12MapFp2ToG2,
	// P256 ECDSA verification (RIP-7212)
	'0x0000000000000000000000000000000000000100': decodeP256Verify,
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

	const rawOutput = output && output !== '0x' ? output : undefined
	try {
		const decoded = decoder(input, output)
		return {
			params: decoded.params,
			decodedOutput: decoded.decodedOutput ?? rawOutput,
		}
	} catch {
		return {
			params: formatBytes(input),
			decodedOutput: rawOutput,
		}
	}
}
