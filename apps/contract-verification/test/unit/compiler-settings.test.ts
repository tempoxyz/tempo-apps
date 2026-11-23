import { describe, expect, it } from 'vitest'

import {
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

	it('keeps the outputs a caller asked for, for every contract', () => {
		expect(
			verificationOutputSelection({
				'Counter.sol': {
					Counter: ['abi', 'evm.deployedBytecode', 'evm.gasEstimates', 'ir'],
				},
			}),
		).toEqual({
			'*': {
				'*': [
					'abi',
					'evm.deployedBytecode.object',
					'evm.deployedBytecode.sourceMap',
					'evm.deployedBytecode.linkReferences',
					'evm.deployedBytecode.immutableReferences',
				],
			},
		})
	})

	it('asks for every output a job reads when none is requested', () => {
		expect(verificationOutputSelection(undefined)).toEqual({
			'*': { '*': [...VERIFICATION_OUTPUTS] },
		})
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
