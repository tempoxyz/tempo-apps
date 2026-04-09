import { describe, expect, it } from 'vitest'
import {
	normalizeContractSourceResponse,
	parseContractSource,
} from '#lib/domain/contract-source.ts'

describe('contract-source parsing', () => {
	it('normalizes verified contract source responses', () => {
		const source = normalizeContractSourceResponse({
			matchId: '123',
			match: 'exact_match',
			creationMatch: 'exact_match',
			runtimeMatch: 'exact_match',
			chainId: 4217,
			address: '0x1234',
			verifiedAt: '2026-04-01T00:00:00.000Z',
			abi: [{ type: 'function', name: 'foo', inputs: [], outputs: [] }],
			stdJsonInput: {
				language: 'Solidity',
				sources: {
					'contracts/Foo.sol': {
						content: 'contract Foo {}',
					},
				},
				settings: {},
			},
			compilation: {
				compiler: 'solc',
				compilerVersion: '0.8.28+commit.7893614a',
				language: 'Solidity',
				name: 'Foo',
				fullyQualifiedName: 'contracts/Foo.sol:Foo',
				compilerSettings: {},
			},
		})

		expect(source.kind).toBe('verified')
		if (source.kind !== 'verified') return
		expect(source.compilation.name).toBe('Foo')
		expect(source.stdJsonInput.sources['contracts/Foo.sol']?.content).toContain(
			'Foo',
		)
	})

	it('normalizes native contract source responses', () => {
		const source = normalizeContractSourceResponse({
			matchId: 'native:validator-config-v2',
			match: 'exact_match',
			creationMatch: 'exact_match',
			runtimeMatch: 'exact_match',
			chainId: 4217,
			address: '0xcccccccc00000000000000000000000000000000',
			verifiedAt: null,
			name: 'Validator Config V2',
			abi: [{ type: 'function', name: 'validators', inputs: [], outputs: [] }],
			stdJsonInput: null,
			compilation: null,
			sources: {
				'crates/precompiles/src/validator_config_v2/mod.rs': {
					content: 'pub fn validators() {}',
				},
			},
			extensions: {
				tempo: {
					nativeSource: {
						kind: 'precompile',
						language: 'Rust',
						bytecodeVerified: false,
						repository: 'tempoxyz/tempo',
						commit: 'abcdef1234567890',
						commitUrl:
							'https://github.com/tempoxyz/tempo/commit/abcdef1234567890',
						paths: ['crates/precompiles/src/validator_config_v2/mod.rs'],
						entrypoints: ['crates/precompiles/src/validator_config_v2/mod.rs'],
						activation: {
							protocolVersion: 'T2',
							fromBlock: null,
							toBlock: null,
						},
					},
				},
			},
		})

		expect(source.kind).toBe('native')
		if (source.kind !== 'native') return
		expect(source.nativeSource.kind).toBe('precompile')
		expect(
			source.sources['crates/precompiles/src/validator_config_v2/mod.rs'],
		).toBeDefined()

		const reparsed = parseContractSource(source)
		expect(reparsed.kind).toBe('native')
	})
})
