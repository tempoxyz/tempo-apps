import { describe, expect, it } from 'vitest'

import {
	MAX_SELECTED_CONTRACTS,
	VERIFICATION_OUTPUTS,
	allowlistSoliditySettings,
	sanitizeCompilerSettings,
	verificationOutputSelection,
} from '../../container/compiler-settings.ts'

describe('allowlistSoliditySettings', () => {
	it('keeps settings that change bytecode or metadata', () => {
		const settings = {
			remappings: ['a/=lib/a/'],
			optimizer: { enabled: true, runs: 200, details: { yul: true } },
			evmVersion: 'cancun',
			viaIR: true,
			metadata: { bytecodeHash: 'ipfs', appendCBOR: true },
			libraries: {
				'L.sol': { L: '0x0000000000000000000000000000000000000001' },
			},
			debug: { revertStrings: 'strip' },
		}
		const allowed = allowlistSoliditySettings(settings)
		const { outputSelection: _, ...rest } = allowed
		expect(rest).toEqual(settings)
	})

	it('drops modelChecker, stopAfter, experimental and unknown keys', () => {
		const allowed = allowlistSoliditySettings({
			optimizer: { enabled: false },
			modelChecker: { engine: 'all' },
			stopAfter: 'parsing',
			experimental: { anything: true },
			somethingElse: 1,
			debug: { revertStrings: 'default', other: true },
		})
		expect(Object.keys(allowed).sort()).toEqual([
			'debug',
			'optimizer',
			'outputSelection',
		])
		expect(allowed.debug).toEqual({ revertStrings: 'default' })
	})

	it('drops prototype keys inside forwarded settings', () => {
		const settings = JSON.parse(
			'{"optimizer":{"__proto__":{"x":1},"enabled":true}}',
		)
		expect(allowlistSoliditySettings(settings).optimizer).toEqual({
			enabled: true,
		})
	})
})

describe('verificationOutputSelection', () => {
	it('limits a select-everything request to the outputs a job reads', () => {
		expect(
			verificationOutputSelection({ '*': { '*': ['*'], '': ['ast'] } }),
		).toEqual({
			'*': { '*': [...VERIFICATION_OUTPUTS] },
		})
	})

	it('keeps the files and contracts the caller selected', () => {
		expect(
			verificationOutputSelection({
				'src/Token.sol': {
					Token: ['abi', 'evm.deployedBytecode', 'evm.gasEstimates', 'ir'],
				},
			}),
		).toEqual({
			'src/Token.sol': {
				Token: [
					'abi',
					'evm.bytecode.object',
					'evm.bytecode.linkReferences',
					'evm.deployedBytecode.object',
					'evm.deployedBytecode.sourceMap',
					'evm.deployedBytecode.linkReferences',
					'evm.deployedBytecode.immutableReferences',
				],
			},
		})
	})

	it('always selects the bytecode a job compares', () => {
		expect(verificationOutputSelection({ '*': { '*': ['abi'] } })).toEqual({
			'*': {
				'*': [
					'abi',
					'evm.bytecode.object',
					'evm.bytecode.linkReferences',
					'evm.deployedBytecode.object',
					'evm.deployedBytecode.linkReferences',
					'evm.deployedBytecode.immutableReferences',
				],
			},
		})
	})

	it('selects every output for every contract when no contract is selected', () => {
		const all = { '*': { '*': [...VERIFICATION_OUTPUTS] } }
		expect(verificationOutputSelection(undefined)).toEqual(all)
		expect(verificationOutputSelection({ 'a.sol': { '': ['ast'] } })).toEqual(
			all,
		)
	})

	it('keeps at most MAX_SELECTED_CONTRACTS contract entries', () => {
		const contracts = Object.fromEntries(
			Array.from({ length: MAX_SELECTED_CONTRACTS * 4 }, (_, i) => [
				`C${i}`,
				[],
			]),
		)
		const selection = verificationOutputSelection({ 'a.sol': contracts })
		expect(Object.keys(selection['a.sol'] ?? {})).toHaveLength(
			MAX_SELECTED_CONTRACTS,
		)
	})

	it('drops prototype keys from file and contract names', () => {
		const requested = JSON.parse(
			'{"__proto__":{"C":["abi"]},"a.sol":{"constructor":["abi"],"C":["abi"]}}',
		)
		expect(Object.keys(verificationOutputSelection(requested))).toEqual([
			'a.sol',
		])
		expect(
			Object.keys(verificationOutputSelection(requested)['a.sol'] ?? {}),
		).toEqual(['C'])
	})
})

describe('sanitizeCompilerSettings', () => {
	it('applies the Solidity allowlist to Solidity input', () => {
		expect(
			sanitizeCompilerSettings('Solidity', { modelChecker: { engine: 'all' } }),
		).not.toHaveProperty('modelChecker')
	})

	it('keeps Vyper settings keys', () => {
		const settings = {
			outputSelection: { '*': ['abi', 'evm.bytecode'] },
			evmVersion: 'cancun',
			optimize: 'gas',
		}
		expect(sanitizeCompilerSettings('Vyper', settings)).toEqual(settings)
	})
})
