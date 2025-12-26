import * as CBOR from 'cbor-x/decode'
import { Hex } from 'ox'
import semver from 'semver'
import {
	decodeAbiParameters,
	encodeAbiParameters,
	keccak256,
	toBytes,
} from 'viem'

// ============================================================================
// Types
// ============================================================================

export type TransformationType =
	| 'constructorArguments'
	| 'library'
	| 'immutable'
	| 'cborAuxdata'
	| 'callProtection'

export interface Transformation {
	type: 'insert' | 'replace'
	reason: TransformationType
	offset: number
	id?: string
}

export interface TransformationValues {
	constructorArguments?: string
	callProtection?: string
	libraries?: Record<string, string>
	immutables?: Record<string, string>
	cborAuxdata?: Record<string, string>
}

export interface LinkReference {
	start: number
	length: number
}

export interface LinkReferences {
	[file: string]: {
		[library: string]: LinkReference[]
	}
}

export interface ImmutableReference {
	start: number
	length: number
}

export interface ImmutableReferences {
	[astId: string]: ImmutableReference[]
}

export interface CborAuxdataPosition {
	offset: number
	value: string
}

export interface CborAuxdataPositions {
	[id: string]: CborAuxdataPosition
}

export interface BytecodeMatchResult {
	match: 'exact_match' | 'match' | null
	transformations: Transformation[]
	transformationValues: TransformationValues
	libraryMap?: Record<string, string>
	message?: string
}

export interface SolidityDecodedAuxdata {
	ipfs?: string
	solcVersion?: string
	bzzr0?: string
	bzzr1?: string
	experimental?: boolean
}

export interface VyperDecodedAuxdata {
	integrity?: string
	runtimeSize?: number
	dataSizes?: number[]
	immutableSize?: number
	vyperVersion: string
}

export enum AuxdataStyle {
	SOLIDITY = 'solidity',
	VYPER = 'vyper',
	VYPER_LT_0_3_10 = 'vyper_lt_0_3_10',
	VYPER_LT_0_3_5 = 'vyper_lt_0_3_5',
}

// ============================================================================
// CBOR Auxdata Utilities
// ============================================================================

/**
 * Determines the auxdata style for a Vyper compiler version.
 */
export function getVyperAuxdataStyle(
	compilerVersion: string,
):
	| AuxdataStyle.VYPER
	| AuxdataStyle.VYPER_LT_0_3_10
	| AuxdataStyle.VYPER_LT_0_3_5 {
	const version = semver.valid(semver.coerce(compilerVersion))

	if (!version) return AuxdataStyle.VYPER
	if (semver.lt(version, '0.3.5')) return AuxdataStyle.VYPER_LT_0_3_5
	if (semver.lt(version, '0.3.10')) return AuxdataStyle.VYPER_LT_0_3_10

	return AuxdataStyle.VYPER
}

/**
 * Splits bytecode into execution bytecode and CBOR auxdata.
 * Supports both Solidity and Vyper auxdata formats.
 * Format: <execution bytecode><cbor data><2 byte length>
 */
export function splitAuxdata(
	bytecode: string,
	auxdataStyle: AuxdataStyle = AuxdataStyle.SOLIDITY,
): {
	executionBytecode: string
	auxdata: string | null
	cborLength: number
	cborLengthHex: string
} {
	if (!bytecode || bytecode.length < 4) {
		return {
			executionBytecode: bytecode,
			auxdata: null,
			cborLength: 0,
			cborLengthHex: '',
		}
	}

	const code = bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`
	const bytesLength = 4 // 2 bytes = 4 hex chars

	// Vyper < 0.3.5 has fixed 22-byte (11 bytes = 22 hex chars) auxdata with no length suffix
	if (auxdataStyle === AuxdataStyle.VYPER_LT_0_3_5) {
		const fixedAuxdataLength = 22
		if (code.length <= fixedAuxdataLength + 2) {
			return {
				executionBytecode: code,
				auxdata: null,
				cborLength: 0,
				cborLengthHex: '',
			}
		}
		const auxdata = code.slice(-fixedAuxdataLength)
		const executionBytecode = code.slice(0, -fixedAuxdataLength)

		// Validate it's CBOR encoded
		if (isCborEncoded(auxdata)) {
			return {
				executionBytecode,
				auxdata,
				cborLength: fixedAuxdataLength / 2,
				cborLengthHex: '',
			}
		}
		return {
			executionBytecode: code,
			auxdata: null,
			cborLength: 0,
			cborLengthHex: '',
		}
	}

	// All other formats have a 2-byte length suffix
	const cborLengthHex = code.slice(-bytesLength)
	const cborBytesLength = Number.parseInt(cborLengthHex, 16) * 2

	// Validate length
	if (
		cborBytesLength <= 0 ||
		code.length - bytesLength - cborBytesLength <= 0
	) {
		return {
			executionBytecode: code,
			auxdata: null,
			cborLength: 0,
			cborLengthHex: '',
		}
	}

	let auxdata: string
	let executionBytecode: string

	switch (auxdataStyle) {
		case AuxdataStyle.VYPER:
			// Vyper >= 0.3.10: length bytes include themselves in the count
			auxdata = code.slice(
				code.length - cborBytesLength,
				code.length - bytesLength,
			)
			executionBytecode = code.slice(0, code.length - cborBytesLength)
			break
		default:
			// Solidity and Vyper < 0.3.10: length bytes don't include themselves
			auxdata = code.slice(
				code.length - bytesLength - cborBytesLength,
				code.length - bytesLength,
			)
			executionBytecode = code.slice(
				0,
				code.length - bytesLength - cborBytesLength,
			)
			break
	}

	// Validate it's CBOR encoded
	if (isCborEncoded(auxdata)) {
		return {
			executionBytecode,
			auxdata,
			cborLength: cborBytesLength / 2,
			cborLengthHex,
		}
	}

	return {
		executionBytecode: code,
		auxdata: null,
		cborLength: 0,
		cborLengthHex: '',
	}
}

/**
 * Attempts to decode the auxdata to verify if it's CBOR-encoded.
 */
function isCborEncoded(auxdata: string): boolean {
	try {
		CBOR.decode(Hex.toBytes(`0x${auxdata}`))
		return true
	} catch {
		return false
	}
}

/**
 * Decodes Vyper CBOR auxdata and returns parsed metadata.
 */
export function decodeVyperAuxdata(
	bytecode: string,
	auxdataStyle: AuxdataStyle,
): VyperDecodedAuxdata {
	const { auxdata } = splitAuxdata(bytecode, auxdataStyle)
	if (!auxdata) throw new Error('Auxdata is not in the bytecode')

	const cborDecodedObject = CBOR.decode(Hex.toBytes(`0x${auxdata}`)) as unknown

	if (auxdataStyle === AuxdataStyle.VYPER) {
		// Vyper >= 0.3.10 stores auxdata as an array
		if (Array.isArray(cborDecodedObject)) {
			const lastElement = cborDecodedObject.at(-1) as { vyper: number[] }
			const compilerVersion = lastElement.vyper.join('.')

			if (semver.gte(compilerVersion, '0.4.1')) {
				// >= 0.4.1: [integrity, runtimeSize, dataSizes, immutableSize, {vyper: [v]}]
				return {
					integrity: cborDecodedObject[0] as string,
					runtimeSize: cborDecodedObject[1] as number,
					dataSizes: cborDecodedObject[2] as number[],
					immutableSize: cborDecodedObject[3] as number,
					vyperVersion: compilerVersion,
				}
			}
			// >= 0.3.10: [runtimeSize, dataSizes, immutableSize, {vyper: [v]}]
			return {
				runtimeSize: cborDecodedObject[0] as number,
				dataSizes: cborDecodedObject[1] as number[],
				immutableSize: cborDecodedObject[2] as number,
				vyperVersion: compilerVersion,
			}
		}
		throw new Error('Invalid Vyper auxdata format for version >= 0.3.10')
	}

	// Vyper < 0.3.10: just {vyper: [0, 3, 8]}
	const decoded = cborDecodedObject as { vyper?: number[] } | null
	if (decoded?.vyper) return { vyperVersion: decoded.vyper.join('.') }

	throw new Error('Invalid Vyper auxdata format')
}

/**
 * Computes immutable references for Vyper contracts.
 * Vyper appends immutables at the end of runtime bytecode (unlike Solidity which has fixed offsets).
 */
export function getVyperImmutableReferences(
	compilerVersion: string,
	creationBytecode: string,
	runtimeBytecode: string,
): ImmutableReferences {
	const auxdataStyle = getVyperAuxdataStyle(compilerVersion)

	// Only Vyper >= 0.3.10 has immutable size in auxdata
	if (auxdataStyle !== AuxdataStyle.VYPER) return {}

	try {
		const decoded = decodeVyperAuxdata(creationBytecode, auxdataStyle)
		if (decoded.immutableSize && decoded.immutableSize > 0) {
			const runtimeLength = runtimeBytecode.startsWith('0x')
				? (runtimeBytecode.length - 2) / 2
				: runtimeBytecode.length / 2
			return {
				'0': [
					{
						length: decoded.immutableSize,
						start: runtimeLength,
					},
				],
			}
		}
	} catch {
		// Cannot decode auxdata, return empty
	}

	return {}
}

/**
 * Check if bytecode has CBOR auxdata with a content hash.
 * We don't fully decode CBOR, just check for presence of IPFS/bzzr markers.
 */
export function hasContentHash(bytecode: string): boolean {
	const { auxdata } = splitAuxdata(bytecode)
	if (!auxdata) return false

	// Look for IPFS marker: "ipfs" in CBOR = 64697066735822 (text string with length)
	// Look for bzzr0/bzzr1 markers
	const lower = auxdata.toLowerCase()
	return (
		lower.includes('6970667358') || // ipfs
		lower.includes('62zzr0') || // bzzr0
		lower.includes('62zzr1') // bzzr1
	)
}

// ============================================================================
// Library Placeholder Handling
// ============================================================================

/**
 * Library placeholders in unlinked bytecode look like:
 * - Post v0.5.0: __$<keccak256(fqn).slice(0,34)>$__
 * - Pre v0.5.0: __<fqn padded to 36 chars>__
 * - Zeroed: 0x0000000000000000000000000000000000000000 (40 zeros)
 */
export function extractLibrariesTransformation(
	recompiledBytecode: string,
	onchainBytecode: string,
	linkReferences: LinkReferences | undefined,
): {
	populatedBytecode: string
	transformations: Transformation[]
	transformationValues: TransformationValues
	libraryMap: Record<string, string>
} {
	const transformations: Transformation[] = []
	const transformationValues: TransformationValues = {}
	const libraryMap: Record<string, string> = {}

	if (!linkReferences || Object.keys(linkReferences).length === 0) {
		return {
			populatedBytecode: recompiledBytecode,
			transformations,
			transformationValues,
			libraryMap,
		}
	}

	let populatedBytecode = recompiledBytecode

	for (const file of Object.keys(linkReferences)) {
		const fileRefs = linkReferences[file]
		if (!fileRefs) continue

		for (const lib of Object.keys(fileRefs)) {
			const libRefs = fileRefs[lib]
			if (!libRefs) continue

			const fqn = `${file}:${lib}` // Fully Qualified Name

			for (const ref of libRefs) {
				const { start, length } = ref
				const strStart = start * 2 + 2 // Each byte = 2 hex chars, +2 for 0x
				const strLength = length * 2

				const placeholder = populatedBytecode.slice(
					strStart,
					strStart + strLength,
				)

				// Calculate expected placeholders
				const fqnHash = keccak256(toBytes(fqn))
				const postV050Placeholder = `__$${fqnHash.slice(2, 36)}$__`
				const trimmedFQN = fqn.slice(0, 36)
				const preV050Placeholder = `__${trimmedFQN.padEnd(38, '_')}`
				const zeroedPlaceholder = '0'.repeat(40)

				// Validate placeholder matches expected format
				if (
					placeholder !== postV050Placeholder &&
					placeholder !== preV050Placeholder &&
					placeholder !== zeroedPlaceholder
				) {
					throw new Error(
						`Library placeholder mismatch for ${fqn}: got ${placeholder}`,
					)
				}

				// Extract actual library address from onchain bytecode
				const actualAddress = onchainBytecode.slice(
					strStart,
					strStart + strLength,
				)
				libraryMap[fqn] = `0x${actualAddress}`

				// Replace placeholder with actual address
				populatedBytecode =
					populatedBytecode.slice(0, strStart) +
					actualAddress +
					populatedBytecode.slice(strStart + strLength)

				transformations.push({
					type: 'replace',
					reason: 'library',
					offset: start,
					id: fqn,
				})

				if (!transformationValues.libraries) {
					transformationValues.libraries = {}
				}
				transformationValues.libraries[fqn] = `0x${actualAddress}`
			}
		}
	}

	return {
		populatedBytecode,
		transformations,
		transformationValues,
		libraryMap,
	}
}

// ============================================================================
// Immutable Variable Handling
// ============================================================================

/**
 * Immutable variables are replaced with zeros in compiled bytecode.
 * We need to extract their actual values from onchain bytecode and
 * replace the zeros with those values for matching.
 *
 * For Solidity: immutables are at fixed offsets, we replace zeros with actual values.
 * For Vyper: immutables are appended at the end of runtime bytecode, we insert them.
 */
export function extractImmutablesTransformation(
	recompiledBytecode: string,
	onchainBytecode: string,
	immutableReferences: ImmutableReferences | undefined,
	auxdataStyle: AuxdataStyle = AuxdataStyle.SOLIDITY,
): {
	populatedBytecode: string
	transformations: Transformation[]
	transformationValues: TransformationValues
} {
	const transformations: Transformation[] = []
	const transformationValues: TransformationValues = {}

	if (!immutableReferences || Object.keys(immutableReferences).length === 0) {
		return {
			populatedBytecode: recompiledBytecode,
			transformations,
			transformationValues,
		}
	}

	// Remove 0x prefix for manipulation
	let bytecodeNoPrefix = recompiledBytecode.startsWith('0x')
		? recompiledBytecode.slice(2)
		: recompiledBytecode
	const onchainNoPrefix = onchainBytecode.startsWith('0x')
		? onchainBytecode.slice(2)
		: onchainBytecode

	const isVyper =
		auxdataStyle === AuxdataStyle.VYPER ||
		auxdataStyle === AuxdataStyle.VYPER_LT_0_3_10 ||
		auxdataStyle === AuxdataStyle.VYPER_LT_0_3_5

	for (const astId of Object.keys(immutableReferences)) {
		const refs = immutableReferences[astId]
		if (!refs) continue

		for (const ref of refs) {
			const { start, length } = ref
			const strStart = start * 2
			const strLength = length * 2

			// Extract immutable value from onchain bytecode
			const immutableValue = onchainNoPrefix.slice(
				strStart,
				strStart + strLength,
			)

			if (isVyper) {
				// Vyper: immutables are appended at the end, insert them
				bytecodeNoPrefix = bytecodeNoPrefix + immutableValue

				transformations.push({
					type: 'insert',
					reason: 'immutable',
					offset: start,
					id: astId,
				})
			} else {
				// Solidity: immutables are at fixed offsets, replace zeros with actual value
				bytecodeNoPrefix =
					bytecodeNoPrefix.slice(0, strStart) +
					immutableValue +
					bytecodeNoPrefix.slice(strStart + strLength)

				transformations.push({
					type: 'replace',
					reason: 'immutable',
					offset: start,
					id: astId,
				})
			}

			if (!transformationValues.immutables) {
				transformationValues.immutables = {}
			}
			transformationValues.immutables[astId] = `0x${immutableValue}`
		}
	}

	return {
		populatedBytecode: `0x${bytecodeNoPrefix}`,
		transformations,
		transformationValues,
	}
}

// ============================================================================
// Call Protection Handling (for Libraries)
// ============================================================================

/**
 * Libraries deployed as standalone contracts have "call protection"
 * at the start: PUSH20 followed by the library address (20 bytes of zeros in compiled).
 * Format: 0x73 + 20 bytes (address) at position 0
 */
export function extractCallProtectionTransformation(
	recompiledBytecode: string,
	onchainBytecode: string,
): {
	populatedBytecode: string
	transformations: Transformation[]
	transformationValues: TransformationValues
} {
	const transformations: Transformation[] = []
	const transformationValues: TransformationValues = {}

	// PUSH20 opcode (0x73) followed by 20 zero bytes
	const callProtectionPlaceholder = `0x73${'00'.repeat(20)}`

	if (recompiledBytecode.toLowerCase().startsWith(callProtectionPlaceholder)) {
		// Extract actual address from onchain bytecode
		const actualProtection = onchainBytecode.slice(
			0,
			callProtectionPlaceholder.length,
		)
		const actualAddress = actualProtection.slice(4) // Remove 0x73

		transformations.push({
			type: 'replace',
			reason: 'callProtection',
			offset: 1, // After the PUSH20 opcode
		})
		transformationValues.callProtection = `0x${actualAddress}`

		const populatedBytecode =
			actualProtection +
			recompiledBytecode.slice(callProtectionPlaceholder.length)

		return { populatedBytecode, transformations, transformationValues }
	}

	return {
		populatedBytecode: recompiledBytecode,
		transformations,
		transformationValues,
	}
}

// ============================================================================
// Constructor Arguments Handling
// ============================================================================

/**
 * Constructor arguments are ABI-encoded and appended to creation bytecode.
 * To match, we extract them from the difference in bytecode lengths.
 */
export function extractConstructorArgumentsTransformation(
	recompiledCreationBytecode: string,
	onchainCreationBytecode: string,
	abi: Array<{
		type: string
		inputs?: Array<{ type: string; name?: string }>
	}>,
): {
	populatedBytecode: string
	transformations: Transformation[]
	transformationValues: TransformationValues
	constructorArguments: string | null
} {
	const transformations: Transformation[] = []
	const transformationValues: TransformationValues = {}

	// If lengths are equal, no constructor arguments
	if (onchainCreationBytecode.length === recompiledCreationBytecode.length) {
		return {
			populatedBytecode: recompiledCreationBytecode,
			transformations,
			transformationValues,
			constructorArguments: null,
		}
	}

	// Extract potential constructor arguments
	const argsHex = onchainCreationBytecode.slice(
		recompiledCreationBytecode.length,
	)
	const constructorArguments = `0x${argsHex}` as const

	// Find constructor in ABI
	const constructorAbi = abi.find((item) => item.type === 'constructor')
	if (!constructorAbi?.inputs || constructorAbi.inputs.length === 0) {
		// No constructor params expected but we have extra bytes
		// This could be a mismatch or special case
		return {
			populatedBytecode: recompiledCreationBytecode,
			transformations,
			transformationValues,
			constructorArguments,
		}
	}

	// Validate by decoding and re-encoding
	try {
		const paramTypes = constructorAbi.inputs.map((i) => ({
			type: i.type,
			name: i.name,
		}))
		const decoded = decodeAbiParameters(paramTypes, constructorArguments)
		const reencoded = encodeAbiParameters(paramTypes, decoded as unknown[])

		if (reencoded.toLowerCase() !== constructorArguments.toLowerCase()) {
			throw new Error('Constructor arguments mismatch after re-encoding')
		}

		transformations.push({
			type: 'insert',
			reason: 'constructorArguments',
			offset: (recompiledCreationBytecode.length - 2) / 2, // Offset in bytes
		})
		transformationValues.constructorArguments = constructorArguments

		return {
			populatedBytecode: recompiledCreationBytecode,
			transformations,
			transformationValues,
			constructorArguments,
		}
	} catch {
		// Failed to decode/validate constructor arguments
		return {
			populatedBytecode: recompiledCreationBytecode,
			transformations,
			transformationValues,
			constructorArguments,
		}
	}
}

// ============================================================================
// CBOR Auxdata Transformation
// ============================================================================

/**
 * Replace CBOR auxdata sections in recompiled bytecode with values from onchain.
 * This allows partial matching when only metadata differs.
 */
export function extractAuxdataTransformation(
	recompiledBytecode: string,
	onchainBytecode: string,
	cborAuxdataPositions: CborAuxdataPositions | undefined,
): {
	populatedBytecode: string
	transformations: Transformation[]
	transformationValues: TransformationValues
} {
	const transformations: Transformation[] = []
	const transformationValues: TransformationValues = {}

	if (!cborAuxdataPositions || Object.keys(cborAuxdataPositions).length === 0) {
		return {
			populatedBytecode: recompiledBytecode,
			transformations,
			transformationValues,
		}
	}

	let populatedBytecode = recompiledBytecode

	for (const [id, auxdata] of Object.entries(cborAuxdataPositions)) {
		const { offset, value } = auxdata
		const strStart = offset * 2 + 2 // +2 for 0x
		const strEnd = strStart + value.length - 2 // -2 because value includes 0x

		// Get corresponding section from onchain bytecode
		const onchainAuxdata = onchainBytecode.slice(strStart, strEnd)

		if (onchainAuxdata.length === 0) {
			// Onchain bytecode might have auxdata disabled (has 0xff terminator)
			// Remove the auxdata section entirely
			populatedBytecode =
				populatedBytecode.slice(0, strStart - 2) +
				populatedBytecode.slice(strEnd)
		} else {
			// Replace with onchain auxdata
			populatedBytecode =
				populatedBytecode.slice(0, strStart) +
				onchainAuxdata +
				populatedBytecode.slice(strEnd)
		}

		transformations.push({
			type: 'replace',
			reason: 'cborAuxdata',
			offset,
			id,
		})

		if (!transformationValues.cborAuxdata) {
			transformationValues.cborAuxdata = {}
		}
		transformationValues.cborAuxdata[id] = `0x${onchainAuxdata}`
	}

	return {
		populatedBytecode,
		transformations,
		transformationValues,
	}
}

// ============================================================================
// Main Bytecode Matching
// ============================================================================

export interface MatchBytecodeOptions {
	onchainBytecode: string
	recompiledBytecode: string
	isCreation: boolean
	linkReferences?: LinkReferences
	immutableReferences?: ImmutableReferences
	cborAuxdataPositions?: CborAuxdataPositions
	auxdataStyle?: AuxdataStyle
	abi?: Array<{
		type: string
		inputs?: Array<{ type: string; name?: string }>
	}>
}

/**
 * Main function to match recompiled bytecode against onchain bytecode.
 * Handles libraries, immutables, call protection, constructor args, and metadata.
 */
export function matchBytecode(
	options: MatchBytecodeOptions,
): BytecodeMatchResult {
	const {
		onchainBytecode,
		recompiledBytecode,
		isCreation,
		linkReferences,
		immutableReferences,
		cborAuxdataPositions,
		auxdataStyle = AuxdataStyle.SOLIDITY,
		abi,
	} = options

	const allTransformations: Transformation[] = []
	const allTransformationValues: TransformationValues = {}
	let populatedBytecode = recompiledBytecode
	let libraryMap: Record<string, string> = {}

	// 1. Handle call protection (runtime only, for libraries)
	if (!isCreation) {
		const callProtectionResult = extractCallProtectionTransformation(
			populatedBytecode,
			onchainBytecode,
		)
		populatedBytecode = callProtectionResult.populatedBytecode
		allTransformations.push(...callProtectionResult.transformations)
		Object.assign(
			allTransformationValues,
			callProtectionResult.transformationValues,
		)
	}

	// 2. Handle immutables (runtime only)
	if (!isCreation && immutableReferences) {
		const immutablesResult = extractImmutablesTransformation(
			populatedBytecode,
			onchainBytecode,
			immutableReferences,
			auxdataStyle,
		)
		populatedBytecode = immutablesResult.populatedBytecode
		allTransformations.push(...immutablesResult.transformations)
		Object.assign(
			allTransformationValues,
			immutablesResult.transformationValues,
		)
	}

	// 3. Handle library placeholders (both creation and runtime)
	if (linkReferences) {
		const librariesResult = extractLibrariesTransformation(
			populatedBytecode,
			onchainBytecode,
			linkReferences,
		)
		populatedBytecode = librariesResult.populatedBytecode
		allTransformations.push(...librariesResult.transformations)
		Object.assign(allTransformationValues, librariesResult.transformationValues)
		libraryMap = librariesResult.libraryMap
	}

	// 4. Check for direct match
	const doBytecodesMatch = isCreation
		? onchainBytecode.toLowerCase().startsWith(populatedBytecode.toLowerCase())
		: populatedBytecode.toLowerCase() === onchainBytecode.toLowerCase()

	if (doBytecodesMatch) {
		// Check if this is a "perfect" match (has valid content hash) or "partial" (no hash)
		const isPerfect = hasContentHash(recompiledBytecode)

		// For creation bytecode, also extract constructor arguments
		if (isCreation && abi) {
			const constructorResult = extractConstructorArgumentsTransformation(
				populatedBytecode,
				onchainBytecode,
				abi,
			)
			allTransformations.push(...constructorResult.transformations)
			Object.assign(
				allTransformationValues,
				constructorResult.transformationValues,
			)
		}

		return {
			match: isPerfect ? 'exact_match' : 'match',
			transformations: allTransformations,
			transformationValues: allTransformationValues,
			libraryMap: Object.keys(libraryMap).length > 0 ? libraryMap : undefined,
		}
	}

	// 5. Try partial match by replacing CBOR auxdata
	if (cborAuxdataPositions && Object.keys(cborAuxdataPositions).length > 0) {
		const auxdataResult = extractAuxdataTransformation(
			populatedBytecode,
			onchainBytecode,
			cborAuxdataPositions,
		)
		const populatedWithAuxdata = auxdataResult.populatedBytecode

		const doPopulatedMatch = isCreation
			? onchainBytecode
					.toLowerCase()
					.startsWith(populatedWithAuxdata.toLowerCase())
			: populatedWithAuxdata.toLowerCase() === onchainBytecode.toLowerCase()

		if (doPopulatedMatch) {
			allTransformations.push(...auxdataResult.transformations)
			Object.assign(allTransformationValues, auxdataResult.transformationValues)

			// For creation bytecode, extract constructor arguments
			if (isCreation && abi) {
				const constructorResult = extractConstructorArgumentsTransformation(
					populatedWithAuxdata,
					onchainBytecode,
					abi,
				)
				allTransformations.push(...constructorResult.transformations)
				Object.assign(
					allTransformationValues,
					constructorResult.transformationValues,
				)
			}

			return {
				match: 'match',
				transformations: allTransformations,
				transformationValues: allTransformationValues,
				libraryMap: Object.keys(libraryMap).length > 0 ? libraryMap : undefined,
			}
		}
	}

	// 6. No match - try one more thing: strip metadata and compare
	const { executionBytecode: onchainExec } = splitAuxdata(
		onchainBytecode,
		auxdataStyle,
	)
	const { executionBytecode: recompiledExec } = splitAuxdata(
		populatedBytecode,
		auxdataStyle,
	)

	if (
		onchainExec &&
		recompiledExec &&
		onchainExec.toLowerCase() === recompiledExec.toLowerCase()
	) {
		return {
			match: 'match',
			transformations: allTransformations,
			transformationValues: allTransformationValues,
			libraryMap: Object.keys(libraryMap).length > 0 ? libraryMap : undefined,
			message: 'Matched after stripping metadata',
		}
	}

	// No match
	return {
		match: null,
		transformations: allTransformations,
		transformationValues: allTransformationValues,
		libraryMap: Object.keys(libraryMap).length > 0 ? libraryMap : undefined,
		message: 'Bytecodes do not match',
	}
}

// ============================================================================
// Simplified Matching for Quick Verification
// ============================================================================

/**
 * Simplified matching that doesn't require compiler output details.
 * Uses heuristic metadata stripping for partial matching.
 */
export function matchBytecodeSimple(
	onchainBytecode: string,
	compiledBytecode: string,
): { match: 'exact_match' | 'match' | null; message?: string } {
	const onchain = onchainBytecode.toLowerCase()
	const compiled = compiledBytecode.toLowerCase()

	// Exact match
	if (onchain === compiled) {
		return { match: 'exact_match' }
	}

	// Try stripping CBOR metadata
	const { executionBytecode: onchainExec, auxdata: onchainAux } =
		splitAuxdata(onchainBytecode)
	const { executionBytecode: compiledExec, auxdata: compiledAux } =
		splitAuxdata(compiledBytecode)

	// Both have auxdata and execution matches
	if (
		onchainAux &&
		compiledAux &&
		onchainExec.toLowerCase() === compiledExec.toLowerCase()
	) {
		return { match: 'match', message: 'Matched with different metadata' }
	}

	// Only compiled has auxdata (onchain might have it stripped)
	if (
		compiledAux &&
		!onchainAux &&
		onchain.startsWith(compiledExec.toLowerCase())
	) {
		return { match: 'match', message: 'Onchain bytecode has no metadata' }
	}

	return { match: null, message: 'No match found' }
}
