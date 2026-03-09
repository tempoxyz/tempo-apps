import { describe, it, expect } from 'vitest'
import * as CBOR from 'cbor-x'
import { Hex, Hash } from 'ox'

import {
	AuxdataStyle,
	getVyperAuxdataStyle,
	splitAuxdata,
	decodeVyperAuxdata,
	hasContentHash,
	extractCallProtectionTransformation,
	extractImmutablesTransformation,
	extractLibrariesTransformation,
	extractConstructorArgumentsTransformation,
	extractAuxdataTransformation,
	matchBytecode,
	type LinkReferences,
	type ImmutableReferences,
	type CborAuxdataPositions,
} from '#bytecode-matching.ts'

function keccakString(str: string): `0x${string}` {
	return Hash.keccak256(Hex.fromString(str))
}

describe('getVyperAuxdataStyle', () => {
	it('returns VYPER_LT_0_3_5 for versions < 0.3.5', () => {
		expect(getVyperAuxdataStyle('0.3.4')).toBe(AuxdataStyle.VYPER_LT_0_3_5)
		expect(getVyperAuxdataStyle('0.3.0')).toBe(AuxdataStyle.VYPER_LT_0_3_5)
		expect(getVyperAuxdataStyle('0.2.16')).toBe(AuxdataStyle.VYPER_LT_0_3_5)
	})

	it('returns VYPER_LT_0_3_10 for versions 0.3.5–0.3.9', () => {
		expect(getVyperAuxdataStyle('0.3.5')).toBe(AuxdataStyle.VYPER_LT_0_3_10)
		expect(getVyperAuxdataStyle('0.3.7')).toBe(AuxdataStyle.VYPER_LT_0_3_10)
		expect(getVyperAuxdataStyle('0.3.9')).toBe(AuxdataStyle.VYPER_LT_0_3_10)
	})

	it('returns VYPER for versions >= 0.3.10', () => {
		expect(getVyperAuxdataStyle('0.3.10')).toBe(AuxdataStyle.VYPER)
		expect(getVyperAuxdataStyle('0.4.0')).toBe(AuxdataStyle.VYPER)
		expect(getVyperAuxdataStyle('0.4.1')).toBe(AuxdataStyle.VYPER)
		expect(getVyperAuxdataStyle('1.0.0')).toBe(AuxdataStyle.VYPER)
	})

	it('returns VYPER for invalid versions', () => {
		expect(getVyperAuxdataStyle('invalid')).toBe(AuxdataStyle.VYPER)
		expect(getVyperAuxdataStyle('')).toBe(AuxdataStyle.VYPER)
	})
})

describe('splitAuxdata', () => {
	describe('solidity CBOR auxdata', () => {
		it('extracts valid Solidity CBOR auxdata', () => {
			const cborData = CBOR.encode({ solc: [0, 8, 20], ipfs: 'QmTest' })
			const cborHex = Hex.fromBytes(cborData).slice(2)
			const lengthHex = cborHex.length / 2
			const lengthSuffix = lengthHex.toString(16).padStart(4, '0')
			const bytecode = `0x6080604052${cborHex}${lengthSuffix}`

			const result = splitAuxdata(bytecode, AuxdataStyle.SOLIDITY)

			expect(result.auxdata).toBe(cborHex)
			expect(result.executionBytecode).toBe('0x6080604052')
			expect(result.cborLength).toBe(lengthHex)
			expect(result.cborLengthHex).toBe(lengthSuffix)
		})

		it('handles bytecode without 0x prefix', () => {
			const cborData = CBOR.encode({ test: 1 })
			const cborHex = Hex.fromBytes(cborData).slice(2)
			const lengthHex = cborHex.length / 2
			const lengthSuffix = lengthHex.toString(16).padStart(4, '0')
			const bytecode = `6080604052${cborHex}${lengthSuffix}`

			const result = splitAuxdata(bytecode, AuxdataStyle.SOLIDITY)

			expect(result.auxdata).toBe(cborHex)
		})

		it('returns null auxdata for short bytecode', () => {
			const result = splitAuxdata('0x60', AuxdataStyle.SOLIDITY)

			expect(result.auxdata).toBeNull()
			expect(result.executionBytecode).toBe('0x60')
			expect(result.cborLength).toBe(0)
		})

		it('returns null auxdata for empty bytecode', () => {
			const result = splitAuxdata('', AuxdataStyle.SOLIDITY)

			expect(result.auxdata).toBeNull()
			expect(result.executionBytecode).toBe('')
		})

		it('returns null for invalid CBOR data', () => {
			const bytecode = '0x608060405260deadbeef0010'
			const result = splitAuxdata(bytecode, AuxdataStyle.SOLIDITY)

			expect(result.auxdata).toBeNull()
		})
	})

	describe('vyper < 0.3.5 auxdata', () => {
		it('handles fixed-length auxdata pattern (no length suffix)', () => {
			const result = splitAuxdata('0x6080', AuxdataStyle.VYPER_LT_0_3_5)

			expect(result.auxdata).toBeNull()
			expect(result.cborLengthHex).toBe('')
		})

		it('returns null for too short bytecode', () => {
			const result = splitAuxdata('0x6080', AuxdataStyle.VYPER_LT_0_3_5)

			expect(result.auxdata).toBeNull()
		})
	})

	describe('vyper >= 0.3.10 auxdata', () => {
		it('extracts Vyper auxdata with length including itself', () => {
			const vyperMetadata = [100, [32], 0, { vyper: [0, 3, 10] }]
			const cborData = CBOR.encode(vyperMetadata)
			const cborHex = Hex.fromBytes(cborData).slice(2)
			const totalLength = (cborHex.length + 4) / 2
			const lengthSuffix = totalLength.toString(16).padStart(4, '0')
			const bytecode = `0x6080604052${cborHex}${lengthSuffix}`

			const result = splitAuxdata(bytecode, AuxdataStyle.VYPER)

			expect(result.auxdata).toBe(cborHex)
			expect(result.cborLengthHex).toBe(lengthSuffix)
		})
	})

	describe('vyper 0.3.5-0.3.9 auxdata', () => {
		it('extracts Vyper auxdata with length not including itself', () => {
			const vyperMetadata = { vyper: [0, 3, 8] }
			const cborData = CBOR.encode(vyperMetadata)
			const cborHex = Hex.fromBytes(cborData).slice(2)
			const lengthHex = cborHex.length / 2
			const lengthSuffix = lengthHex.toString(16).padStart(4, '0')
			const bytecode = `0x6080604052${cborHex}${lengthSuffix}`

			const result = splitAuxdata(bytecode, AuxdataStyle.VYPER_LT_0_3_10)

			expect(result.auxdata).toBe(cborHex)
			expect(result.cborLength).toBe(lengthHex)
		})
	})
})

describe('decodeVyperAuxdata', () => {
	it('decodes Vyper >= 0.4.1 format', () => {
		const vyperMetadata = [
			'integrity-hash',
			1000,
			[32, 64],
			96,
			{ vyper: [0, 4, 1] },
		]
		const cborData = CBOR.encode(vyperMetadata)
		const cborHex = Hex.fromBytes(cborData).slice(2)
		const totalLength = (cborHex.length + 4) / 2
		const lengthSuffix = totalLength.toString(16).padStart(4, '0')
		const bytecode = `0x6080604052${cborHex}${lengthSuffix}`

		const result = decodeVyperAuxdata(bytecode, AuxdataStyle.VYPER)

		expect(result.vyperVersion).toBe('0.4.1')
		expect(result.integrity).toBe('integrity-hash')
		expect(result.runtimeSize).toBe(1000)
		expect(result.dataSizes).toStrictEqual([32, 64])
		expect(result.immutableSize).toBe(96)
	})

	it('decodes Vyper 0.3.10-0.4.0 format', () => {
		const vyperMetadata = [500, [16], 32, { vyper: [0, 3, 10] }]
		const cborData = CBOR.encode(vyperMetadata)
		const cborHex = Hex.fromBytes(cborData).slice(2)
		const totalLength = (cborHex.length + 4) / 2
		const lengthSuffix = totalLength.toString(16).padStart(4, '0')
		const bytecode = `0x6080604052${cborHex}${lengthSuffix}`

		const result = decodeVyperAuxdata(bytecode, AuxdataStyle.VYPER)

		expect(result.vyperVersion).toBe('0.3.10')
		expect(result.runtimeSize).toBe(500)
		expect(result.dataSizes).toStrictEqual([16])
		expect(result.immutableSize).toBe(32)
	})

	it('decodes Vyper < 0.3.10 format', () => {
		const vyperMetadata = { vyper: [0, 3, 8] }
		const cborData = CBOR.encode(vyperMetadata)
		const cborHex = Hex.fromBytes(cborData).slice(2)
		const lengthHex = cborHex.length / 2
		const lengthSuffix = lengthHex.toString(16).padStart(4, '0')
		const bytecode = `0x6080604052${cborHex}${lengthSuffix}`

		const result = decodeVyperAuxdata(bytecode, AuxdataStyle.VYPER_LT_0_3_10)

		expect(result.vyperVersion).toBe('0.3.8')
	})

	it('throws for missing auxdata', () => {
		expect(() => decodeVyperAuxdata('0x6080', AuxdataStyle.VYPER)).toThrow(
			'Auxdata is not in the bytecode',
		)
	})
})

describe('hasContentHash', () => {
	it('returns false for bytecode without content hash markers', () => {
		const metadata = { solc: [0, 8, 20] }
		const cborData = CBOR.encode(metadata)
		const cborHex = Hex.fromBytes(cborData).slice(2)
		const lengthHex = cborHex.length / 2
		const lengthSuffix = lengthHex.toString(16).padStart(4, '0')
		const bytecode = `0x6080604052${cborHex}${lengthSuffix}`

		expect(hasContentHash(bytecode)).toBeFalsy()
	})

	it('returns false for bytecode without auxdata', () => {
		expect(hasContentHash('0x6080604052')).toBeFalsy()
	})

	it('returns false for empty bytecode', () => {
		expect(hasContentHash('')).toBeFalsy()
	})
})

describe('extractCallProtectionTransformation', () => {
	it('extracts call protection when present', () => {
		const placeholder = `0x73${'00'.repeat(20)}`
		const restBytecode = '6080604052'
		const recompiledBytecode = placeholder + restBytecode

		const actualAddress = 'deadbeef'.repeat(5)
		const onchainBytecode = `0x73${actualAddress}${restBytecode}`

		const result = extractCallProtectionTransformation(
			recompiledBytecode,
			onchainBytecode,
		)

		expect(result.transformations).toHaveLength(1)
		expect(result.transformations[0]?.reason).toBe('callProtection')
		expect(result.transformationValues.callProtection).toBe(
			`0x${actualAddress}`,
		)
		expect(result.populatedBytecode).toBe(onchainBytecode)
	})

	it('returns unchanged bytecode when no call protection', () => {
		const recompiledBytecode = '0x6080604052'
		const onchainBytecode = '0x6080604052'

		const result = extractCallProtectionTransformation(
			recompiledBytecode,
			onchainBytecode,
		)

		expect(result.transformations).toHaveLength(0)
		expect(result.populatedBytecode).toBe(recompiledBytecode)
	})
})

describe('extractImmutablesTransformation', () => {
	it('extracts single immutable for Solidity', () => {
		const immutableReferences: ImmutableReferences = {
			'42': [{ start: 5, length: 32 }],
		}

		const zeros = '00'.repeat(32)
		const value = 'ab'.repeat(32)

		const recompiled = `0x6080604052${zeros}5050`
		const onchain = `0x6080604052${value}5050`

		const result = extractImmutablesTransformation(
			recompiled,
			onchain,
			immutableReferences,
			AuxdataStyle.SOLIDITY,
		)

		expect(result.transformations).toHaveLength(1)
		expect(result.transformations[0]?.reason).toBe('immutable')
		expect(result.transformations[0]?.id).toBe('42')
		expect(result.transformationValues.immutables?.['42']).toBe(`0x${value}`)
		expect(result.populatedBytecode.toLowerCase()).toBe(onchain.toLowerCase())
	})

	it('extracts multiple immutables', () => {
		const immutableReferences: ImmutableReferences = {
			'1': [{ start: 5, length: 32 }],
			'2': [{ start: 37, length: 20 }],
		}

		const zeros1 = '00'.repeat(32)
		const zeros2 = '00'.repeat(20)
		const value1 = 'aa'.repeat(32)
		const value2 = 'bb'.repeat(20)

		const recompiled = `0x6080604052${zeros1}${zeros2}5050`
		const onchain = `0x6080604052${value1}${value2}5050`

		const result = extractImmutablesTransformation(
			recompiled,
			onchain,
			immutableReferences,
			AuxdataStyle.SOLIDITY,
		)

		expect(result.transformations).toHaveLength(2)
		expect(result.transformationValues.immutables?.['1']).toBe(`0x${value1}`)
		expect(result.transformationValues.immutables?.['2']).toBe(`0x${value2}`)
	})

	it('handles Vyper immutables (insert mode)', () => {
		const immutableReferences: ImmutableReferences = {
			'0': [{ start: 5, length: 32 }],
		}

		const immutableValue = 'cc'.repeat(32)
		const recompiled = '0x6080604052'
		const onchain = `0x6080604052${immutableValue}`

		const result = extractImmutablesTransformation(
			recompiled,
			onchain,
			immutableReferences,
			AuxdataStyle.VYPER,
		)

		expect(result.transformations[0]?.type).toBe('insert')
		expect(result.transformationValues.immutables?.['0']).toBe(
			`0x${immutableValue}`,
		)
	})

	it('returns unchanged when no immutable references', () => {
		const recompiled = '0x6080604052'

		const result = extractImmutablesTransformation(recompiled, recompiled)

		expect(result.transformations).toHaveLength(0)
		expect(result.populatedBytecode).toBe(recompiled)
	})
})

describe('extractLibrariesTransformation', () => {
	it('extracts single library reference with post-v0.5.0 placeholder', () => {
		const linkReferences: LinkReferences = {
			'contracts/Math.sol': {
				MathLib: [{ start: 5, length: 20 }],
			},
		}

		const fqn = 'contracts/Math.sol:MathLib'
		const fqnHash = keccakString(fqn)
		const placeholder = `__$${fqnHash.slice(2, 36)}$__`
		const actualAddress = 'deadbeef'.padEnd(40, '0')

		const recompiled = `0x6080604052${placeholder}5050`
		const onchain = `0x6080604052${actualAddress}5050`

		const result = extractLibrariesTransformation(
			recompiled,
			onchain,
			linkReferences,
		)

		expect(result.transformations).toHaveLength(1)
		expect(result.transformations[0]?.reason).toBe('library')
		expect(result.libraryMap[fqn]).toBe(`0x${actualAddress}`)
		expect(result.populatedBytecode.toLowerCase()).toBe(onchain.toLowerCase())
	})

	it('extracts multiple library references', () => {
		const linkReferences: LinkReferences = {
			'contracts/Math.sol': {
				MathLib: [{ start: 5, length: 20 }],
			},
			'contracts/Utils.sol': {
				StringUtils: [{ start: 25, length: 20 }],
			},
		}

		const fqn1 = 'contracts/Math.sol:MathLib'
		const fqn2 = 'contracts/Utils.sol:StringUtils'
		const placeholder1 = `__$${keccakString(fqn1).slice(2, 36)}$__`
		const placeholder2 = `__$${keccakString(fqn2).slice(2, 36)}$__`
		const addr1 = 'aa'.repeat(20)
		const addr2 = 'bb'.repeat(20)

		const recompiled = `0x6080604052${placeholder1}${placeholder2}5050`
		const onchain = `0x6080604052${addr1}${addr2}5050`

		const result = extractLibrariesTransformation(
			recompiled,
			onchain,
			linkReferences,
		)

		expect(result.transformations).toHaveLength(2)
		expect(Object.keys(result.libraryMap)).toHaveLength(2)
	})

	it('handles zeroed placeholders', () => {
		const linkReferences: LinkReferences = {
			'lib.sol': {
				Lib: [{ start: 5, length: 20 }],
			},
		}

		const zeroPlaceholder = '0'.repeat(40)
		const actualAddress = 'ff'.repeat(20)

		const recompiled = `0x6080604052${zeroPlaceholder}5050`
		const onchain = `0x6080604052${actualAddress}5050`

		const result = extractLibrariesTransformation(
			recompiled,
			onchain,
			linkReferences,
		)

		expect(result.transformations).toHaveLength(1)
		expect(result.libraryMap['lib.sol:Lib']).toBe(`0x${actualAddress}`)
	})

	it('returns unchanged when no link references', () => {
		const bytecode = '0x6080604052'

		const result = extractLibrariesTransformation(bytecode, bytecode)

		expect(result.transformations).toHaveLength(0)
		expect(result.populatedBytecode).toBe(bytecode)
	})
})

describe('extractConstructorArgumentsTransformation', () => {
	it('extracts constructor arguments with uint256', () => {
		const abi = [
			{
				type: 'constructor',
				inputs: [{ type: 'uint256', name: 'value' }],
			},
		]

		const recompiled = '0x6080604052'
		const argsValue =
			'0000000000000000000000000000000000000000000000000000000000000064'
		const onchain = `0x6080604052${argsValue}`

		const result = extractConstructorArgumentsTransformation(
			recompiled,
			onchain,
			abi,
		)

		expect(result.constructorArguments).toBe(`0x${argsValue}`)
		expect(result.transformations).toHaveLength(1)
		expect(result.transformations[0]?.reason).toBe('constructorArguments')
		expect(result.transformationValues.constructorArguments).toBe(
			`0x${argsValue}`,
		)
	})

	it('extracts constructor arguments with multiple params', () => {
		const abi = [
			{
				type: 'constructor',
				inputs: [
					{ type: 'address', name: 'owner' },
					{ type: 'uint256', name: 'amount' },
				],
			},
		]

		const recompiled = '0x6080604052'
		const address =
			'000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
		const amount =
			'0000000000000000000000000000000000000000000000000000000000000064'
		const onchain = `0x6080604052${address}${amount}`

		const result = extractConstructorArgumentsTransformation(
			recompiled,
			onchain,
			abi,
		)

		expect(result.constructorArguments).toBe(`0x${address}${amount}`)
		expect(result.transformations).toHaveLength(1)
	})

	it('returns null when no constructor arguments (same length)', () => {
		const abi = [{ type: 'constructor', inputs: [] }]
		const bytecode = '0x6080604052'

		const result = extractConstructorArgumentsTransformation(
			bytecode,
			bytecode,
			abi,
		)

		expect(result.constructorArguments).toBeNull()
		expect(result.transformations).toHaveLength(0)
	})

	it('handles missing constructor in ABI', () => {
		const abi = [{ type: 'function', inputs: [] }]

		const recompiled = '0x6080604052'
		const onchain = '0x608060405260001234'

		const result = extractConstructorArgumentsTransformation(
			recompiled,
			onchain,
			abi,
		)

		expect(result.constructorArguments).toBe('0x60001234')
		expect(result.transformations).toHaveLength(0)
	})
})

describe('extractAuxdataTransformation', () => {
	it('replaces auxdata at specified positions', () => {
		const cborAuxdataPositions: CborAuxdataPositions = {
			'0': { offset: 5, value: '0xaabbccdd' },
		}

		const recompiled = '0x6080604052aabbccdd5050'
		const onchain = '0x608060405211223344005050'

		const result = extractAuxdataTransformation(
			recompiled,
			onchain,
			cborAuxdataPositions,
		)

		expect(result.transformations).toHaveLength(1)
		expect(result.transformations[0]?.reason).toBe('cborAuxdata')
		expect(result.transformationValues.cborAuxdata?.['0']).toBe('0x11223344')
	})

	it('handles multiple auxdata positions', () => {
		const cborAuxdataPositions: CborAuxdataPositions = {
			'0': { offset: 5, value: '0xaabb' },
			'1': { offset: 9, value: '0xccdd' },
		}

		const recompiled = '0x6080604052aabbccdd5050'
		const onchain = '0x60806040521122334400005050'

		const result = extractAuxdataTransformation(
			recompiled,
			onchain,
			cborAuxdataPositions,
		)

		expect(result.transformations).toHaveLength(2)
	})

	it('returns unchanged when no auxdata positions', () => {
		const bytecode = '0x6080604052'

		const result = extractAuxdataTransformation(bytecode, bytecode)

		expect(result.transformations).toHaveLength(0)
		expect(result.populatedBytecode).toBe(bytecode)
	})
})

describe('matchBytecode', () => {
	it('returns match for identical bytecode', () => {
		const metadata = { solc: [0, 8, 20] }
		const cborData = CBOR.encode(metadata)
		const cborHex = Hex.fromBytes(cborData).slice(2)
		const lengthSuffix = (cborHex.length / 2).toString(16).padStart(4, '0')
		const bytecode = `0x6080604052${cborHex}${lengthSuffix}`

		const result = matchBytecode({
			onchainBytecode: bytecode,
			recompiledBytecode: bytecode,
			isCreation: false,
		})

		expect(result.match).toBe('match')
		expect(result.transformations).toStrictEqual([])
	})

	it('returns match when only metadata differs', () => {
		const metadata1 = { solc: [0, 8, 20] }
		const metadata2 = { solc: [0, 8, 21] }

		const cbor1 = Hex.fromBytes(CBOR.encode(metadata1)).slice(2)
		const cbor2 = Hex.fromBytes(CBOR.encode(metadata2)).slice(2)

		const len1 = (cbor1.length / 2).toString(16).padStart(4, '0')
		const len2 = (cbor2.length / 2).toString(16).padStart(4, '0')

		const recompiled = `0x6080604052${cbor1}${len1}`
		const onchain = `0x6080604052${cbor2}${len2}`

		const result = matchBytecode({
			onchainBytecode: onchain,
			recompiledBytecode: recompiled,
			isCreation: false,
		})

		expect(result.match).toBe('match')
	})

	it('returns null for non-matching bytecode', () => {
		const recompiled = '0x6080604052aabbccdd'
		const onchain = '0x6080604052ffffffff'

		const result = matchBytecode({
			onchainBytecode: onchain,
			recompiledBytecode: recompiled,
			isCreation: false,
		})

		expect(result.match).toBeNull()
		expect(result.message).toBe(
			'Bytecodes do not match after all transformations',
		)
	})

	it('handles library transformations', () => {
		const linkReferences: LinkReferences = {
			'lib.sol': {
				Lib: [{ start: 5, length: 20 }],
			},
		}

		const fqn = 'lib.sol:Lib'
		const placeholder = '0'.repeat(40)
		const actualAddress = 'deadbeef'.padEnd(40, '0')

		const metadata = { solc: [0, 8, 20] }
		const cbor = Hex.fromBytes(CBOR.encode(metadata)).slice(2)
		const len = (cbor.length / 2).toString(16).padStart(4, '0')

		const recompiled = `0x6080604052${placeholder}${cbor}${len}`
		const onchain = `0x6080604052${actualAddress}${cbor}${len}`

		const result = matchBytecode({
			onchainBytecode: onchain,
			recompiledBytecode: recompiled,
			isCreation: false,
			linkReferences,
		})

		expect(result.match).toBe('match')
		expect(result.libraryMap?.[fqn]).toBe(`0x${actualAddress}`)
	})

	it('handles immutable transformations', () => {
		const immutableReferences: ImmutableReferences = {
			'42': [{ start: 5, length: 32 }],
		}

		const zeros = '00'.repeat(32)
		const value = 'ab'.repeat(32)

		const metadata = { solc: [0, 8, 20] }
		const cbor = Hex.fromBytes(CBOR.encode(metadata)).slice(2)
		const len = (cbor.length / 2).toString(16).padStart(4, '0')

		const recompiled = `0x6080604052${zeros}${cbor}${len}`
		const onchain = `0x6080604052${value}${cbor}${len}`

		const result = matchBytecode({
			onchainBytecode: onchain,
			recompiledBytecode: recompiled,
			isCreation: false,
			immutableReferences,
		})

		expect(result.match).toBe('match')
		expect(result.transformationValues.immutables?.['42']).toBe(`0x${value}`)
	})

	it('handles creation bytecode with constructor args', () => {
		const abi = [
			{
				type: 'constructor',
				inputs: [{ type: 'uint256', name: 'value' }],
			},
		]

		const metadata = { solc: [0, 8, 20] }
		const cbor = Hex.fromBytes(CBOR.encode(metadata)).slice(2)
		const len = (cbor.length / 2).toString(16).padStart(4, '0')
		const constructorArgs =
			'0000000000000000000000000000000000000000000000000000000000000064'

		const recompiled = `0x6080604052${cbor}${len}`
		const onchain = `0x6080604052${cbor}${len}${constructorArgs}`

		const result = matchBytecode({
			onchainBytecode: onchain,
			recompiledBytecode: recompiled,
			isCreation: true,
			abi,
		})

		expect(result.match).toBe('match')
		expect(result.transformationValues.constructorArguments).toBe(
			`0x${constructorArgs}`,
		)
	})
})
