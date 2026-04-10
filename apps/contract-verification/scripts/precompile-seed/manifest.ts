import type { Abi } from 'viem'
import { Abis, Addresses } from 'viem/tempo'

import { chainIds, type ChainId } from '#wagmi.config.ts'

export type NativeContractRuntimeType =
	| 'precompile'
	| 'native_contract'
	| 'system_contract'

export type NativeContractActivation = {
	protocolVersion: string | null
	fromBlock: number | null
	toBlock: number | null
}

export type NativeContractDeployment = {
	chainId: ChainId
	address: `0x${string}`
	activation: NativeContractActivation
}

export type NativeContractManifestReferences = {
	addressDefinitionPaths: ReadonlyArray<string>
	abiReferencePaths: ReadonlyArray<string>
	registrationPaths: ReadonlyArray<string>
	specificationPaths: ReadonlyArray<string>
}

export type NativeContractManifestEntry = {
	id: string
	abi: Abi
	name: string
	language: string
	commit: string
	commitUrl: string
	repository: string
	sourceRoot: string
	docsUrl?: string | undefined
	runtimeType: NativeContractRuntimeType
	paths: readonly [string, ...Array<string>]
	references: NativeContractManifestReferences
	entrypoints: readonly [string, ...Array<string>]
	deployments: ReadonlyArray<NativeContractDeployment>
}

const tempoRepository = 'tempoxyz/tempo' as const
const tempoCommit = '194dec5c35deeb58ddb3ab88ad028122b511a5af' as const
const tempoCommitUrl =
	`https://github.com/${tempoRepository}/tree/${tempoCommit}` as const

const addressDefinitionPaths = [
	'crates/contracts/src/precompiles/mod.rs',
] as const
const registrationPaths = ['crates/precompiles/src/lib.rs'] as const

const genesisActivation = {
	protocolVersion: null,
	fromBlock: 0,
	toBlock: null,
} as const satisfies NativeContractActivation

function buildProtocolActivation(
	protocolVersion: string,
): NativeContractActivation {
	return {
		protocolVersion,
		fromBlock: null,
		toBlock: null,
	}
}

function buildDeployments(
	address: `0x${string}`,
	activation: NativeContractActivation,
): readonly NativeContractDeployment[] {
	return chainIds.map((chainId) => ({ chainId, address, activation }))
}

function buildReferences(options: {
	abiReferencePaths: ReadonlyArray<string>
	specificationPaths?: ReadonlyArray<string>
	registrationPaths?: ReadonlyArray<string>
}): NativeContractManifestReferences {
	return {
		addressDefinitionPaths,
		abiReferencePaths: options.abiReferencePaths,
		registrationPaths: options.registrationPaths ?? registrationPaths,
		specificationPaths: options.specificationPaths ?? [],
	}
}

const validatorConfigAbi = Abis.validatorConfig

const validatorConfigV2Abi = Abis.validatorConfigV2

const accountKeychainAbi = Abis.accountKeychain

const nonceAbi = Abis.nonce

const tip403RegistryAbi = Abis.tip403Registry

const tip20FactoryAbi = Abis.tip20Factory

const tipFeeManagerAbi = [...Abis.feeManager, ...Abis.feeAmm]

const stablecoinDexAbi = Abis.stablecoinDex

const addressRegistryAbi = Abis.addressRegistry

const signatureVerifierAbi = Abis.signatureVerifier

const validatorConfigAddress = Addresses.validator
const validatorConfigV2Address =
	'0xcccccccc00000000000000000000000000000001' as const
const accountKeychainAddress = Addresses.accountKeychain
const nonceManagerAddress = Addresses.nonceManager
const tip403RegistryAddress = Addresses.tip403Registry
const tip20FactoryAddress = Addresses.tip20Factory
const tipFeeManagerAddress = Addresses.feeManager
const stablecoinDexAddress = Addresses.stablecoinDex
const addressRegistryAddress =
	'0xfdc0000000000000000000000000000000000000' as const
const signatureVerifierAddress =
	'0x5165300000000000000000000000000000000000' as const

export const validatorConfigManifest = {
	id: 'validator-config',
	name: 'Validator Config',
	runtimeType: 'precompile',
	language: 'rust',
	abi: validatorConfigAbi,
	repository: tempoRepository,
	commit: tempoCommit,
	commitUrl: tempoCommitUrl,
	docsUrl: 'https://docs.tempo.xyz/documentation/protocol/validators',
	sourceRoot: 'crates/precompiles/src/validator_config',
	paths: [
		'crates/precompiles/src/validator_config/mod.rs',
		'crates/precompiles/src/validator_config/dispatch.rs',
	],
	entrypoints: ['crates/precompiles/src/validator_config/mod.rs'],
	deployments: buildDeployments(validatorConfigAddress, genesisActivation),
	references: buildReferences({
		abiReferencePaths: ['crates/contracts/src/precompiles/validator_config.rs'],
	}),
} as const satisfies NativeContractManifestEntry

export const validatorConfigV2Manifest = {
	id: 'validator-config-v2',
	name: 'Validator Config V2',
	runtimeType: 'precompile',
	language: 'Rust',
	abi: validatorConfigV2Abi,
	repository: tempoRepository,
	commit: tempoCommit,
	commitUrl: tempoCommitUrl,
	docsUrl: 'https://docs.tempo.xyz/protocol/tips/tip-1017',
	sourceRoot: 'crates/precompiles/src/validator_config_v2',
	paths: [
		'crates/precompiles/src/validator_config_v2/mod.rs',
		'crates/precompiles/src/validator_config_v2/dispatch.rs',
	],
	entrypoints: ['crates/precompiles/src/validator_config_v2/mod.rs'],
	deployments: buildDeployments(
		validatorConfigV2Address,
		buildProtocolActivation('T2'),
	),
	references: buildReferences({
		abiReferencePaths: [
			'crates/contracts/src/precompiles/validator_config_v2.rs',
			'tips/ref-impls/src/interfaces/IValidatorConfigV2.sol',
			'tips/ref-impls/src/ValidatorConfigV2.sol',
		],
		specificationPaths: ['tips/tip-1017.md'],
	}),
} as const satisfies NativeContractManifestEntry

export const accountKeychainManifest = {
	id: 'account-keychain',
	name: 'Account Keychain',
	runtimeType: 'precompile',
	language: 'Rust',
	abi: accountKeychainAbi,
	repository: tempoRepository,
	commit: tempoCommit,
	commitUrl: tempoCommitUrl,
	docsUrl: 'https://docs.tempo.xyz/protocol/transactions/AccountKeychain',
	sourceRoot: 'crates/precompiles/src/account_keychain',
	paths: [
		'crates/precompiles/src/account_keychain/mod.rs',
		'crates/precompiles/src/account_keychain/dispatch.rs',
	],
	entrypoints: ['crates/precompiles/src/account_keychain/mod.rs'],
	deployments: buildDeployments(accountKeychainAddress, genesisActivation),
	references: buildReferences({
		abiReferencePaths: ['crates/contracts/src/precompiles/account_keychain.rs'],
	}),
} as const satisfies NativeContractManifestEntry

export const nonceManagerManifest = {
	id: 'nonce-manager',
	name: 'Nonce Manager',
	runtimeType: 'precompile',
	language: 'Rust',
	abi: nonceAbi,
	repository: tempoRepository,
	commit: tempoCommit,
	commitUrl: tempoCommitUrl,
	sourceRoot: 'crates/precompiles/src/nonce',
	paths: [
		'crates/precompiles/src/nonce/mod.rs',
		'crates/precompiles/src/nonce/dispatch.rs',
	],
	entrypoints: ['crates/precompiles/src/nonce/mod.rs'],
	deployments: buildDeployments(nonceManagerAddress, genesisActivation),
	references: buildReferences({
		abiReferencePaths: ['crates/contracts/src/precompiles/nonce.rs'],
	}),
} as const satisfies NativeContractManifestEntry

export const tip403RegistryManifest = {
	id: 'tip403-registry',
	name: 'TIP-403 Registry',
	runtimeType: 'precompile',
	language: 'Rust',
	abi: tip403RegistryAbi,
	repository: tempoRepository,
	commit: tempoCommit,
	commitUrl: tempoCommitUrl,
	docsUrl: 'https://docs.tempo.xyz/documentation/protocol/tip403/spec',
	sourceRoot: 'crates/precompiles/src/tip403_registry',
	paths: [
		'crates/precompiles/src/tip403_registry/mod.rs',
		'crates/precompiles/src/tip403_registry/dispatch.rs',
	],
	entrypoints: ['crates/precompiles/src/tip403_registry/mod.rs'],
	deployments: buildDeployments(tip403RegistryAddress, genesisActivation),
	references: buildReferences({
		abiReferencePaths: ['crates/contracts/src/precompiles/tip403_registry.rs'],
	}),
} as const satisfies NativeContractManifestEntry

export const tip20FactoryManifest = {
	id: 'tip20-factory',
	name: 'TIP-20 Factory',
	runtimeType: 'precompile',
	language: 'Rust',
	abi: tip20FactoryAbi,
	repository: tempoRepository,
	commit: tempoCommit,
	commitUrl: tempoCommitUrl,
	docsUrl: 'https://docs.tempo.xyz/documentation/protocol/tip20/overview',
	sourceRoot: 'crates/precompiles/src/tip20_factory',
	paths: [
		'crates/precompiles/src/tip20_factory/mod.rs',
		'crates/precompiles/src/tip20_factory/dispatch.rs',
	],
	entrypoints: ['crates/precompiles/src/tip20_factory/mod.rs'],
	deployments: buildDeployments(tip20FactoryAddress, genesisActivation),
	references: buildReferences({
		abiReferencePaths: ['crates/contracts/src/precompiles/tip20_factory.rs'],
	}),
} as const satisfies NativeContractManifestEntry

export const tipFeeManagerManifest = {
	id: 'tip-fee-manager',
	name: 'TIP Fee Manager',
	runtimeType: 'precompile',
	language: 'Rust',
	abi: tipFeeManagerAbi,
	repository: tempoRepository,
	commit: tempoCommit,
	commitUrl: tempoCommitUrl,
	docsUrl:
		'https://docs.tempo.xyz/documentation/protocol/fees/spec-fee-amm#2-feemanager-contract',
	sourceRoot: 'crates/precompiles/src/tip_fee_manager',
	paths: [
		'crates/precompiles/src/tip_fee_manager/mod.rs',
		'crates/precompiles/src/tip_fee_manager/dispatch.rs',
		'crates/precompiles/src/tip_fee_manager/amm.rs',
	],
	entrypoints: ['crates/precompiles/src/tip_fee_manager/mod.rs'],
	deployments: buildDeployments(tipFeeManagerAddress, genesisActivation),
	references: buildReferences({
		abiReferencePaths: ['crates/contracts/src/precompiles/tip_fee_manager.rs'],
	}),
} as const satisfies NativeContractManifestEntry

export const stablecoinDexManifest = {
	id: 'stablecoin-dex',
	name: 'Stablecoin DEX',
	runtimeType: 'precompile',
	language: 'Rust',
	abi: stablecoinDexAbi,
	repository: tempoRepository,
	commit: tempoCommit,
	commitUrl: tempoCommitUrl,
	docsUrl: 'https://docs.tempo.xyz/documentation/protocol/exchange',
	sourceRoot: 'crates/precompiles/src/stablecoin_dex',
	paths: [
		'crates/precompiles/src/stablecoin_dex/mod.rs',
		'crates/precompiles/src/stablecoin_dex/dispatch.rs',
		'crates/precompiles/src/stablecoin_dex/order.rs',
		'crates/precompiles/src/stablecoin_dex/orderbook.rs',
		'crates/precompiles/src/stablecoin_dex/error.rs',
	],
	entrypoints: ['crates/precompiles/src/stablecoin_dex/mod.rs'],
	deployments: buildDeployments(stablecoinDexAddress, genesisActivation),
	references: buildReferences({
		abiReferencePaths: ['crates/contracts/src/precompiles/stablecoin_dex.rs'],
	}),
} as const satisfies NativeContractManifestEntry

export const addressRegistryManifest = {
	id: 'address-registry',
	name: 'Address Registry',
	runtimeType: 'precompile',
	language: 'Rust',
	abi: addressRegistryAbi,
	repository: tempoRepository,
	commit: tempoCommit,
	commitUrl: tempoCommitUrl,
	sourceRoot: 'crates/precompiles/src/address_registry',
	paths: [
		'crates/precompiles/src/address_registry/mod.rs',
		'crates/precompiles/src/address_registry/dispatch.rs',
	],
	entrypoints: ['crates/precompiles/src/address_registry/mod.rs'],
	deployments: buildDeployments(
		addressRegistryAddress,
		buildProtocolActivation('T3'),
	),
	references: buildReferences({
		abiReferencePaths: ['crates/contracts/src/precompiles/address_registry.rs'],
	}),
} as const satisfies NativeContractManifestEntry

export const signatureVerifierManifest = {
	id: 'signature-verifier',
	name: 'Signature Verifier',
	runtimeType: 'precompile',
	language: 'Rust',
	abi: signatureVerifierAbi,
	repository: tempoRepository,
	commit: tempoCommit,
	commitUrl: tempoCommitUrl,
	sourceRoot: 'crates/precompiles/src/signature_verifier',
	paths: [
		'crates/precompiles/src/signature_verifier/mod.rs',
		'crates/precompiles/src/signature_verifier/dispatch.rs',
	],
	entrypoints: ['crates/precompiles/src/signature_verifier/mod.rs'],
	deployments: buildDeployments(
		signatureVerifierAddress,
		buildProtocolActivation('T3'),
	),
	references: buildReferences({
		abiReferencePaths: [
			'crates/contracts/src/precompiles/signature_verifier.rs',
		],
	}),
} as const satisfies NativeContractManifestEntry

export const nativeContractsManifest = [
	validatorConfigManifest,
	validatorConfigV2Manifest,
	accountKeychainManifest,
	nonceManagerManifest,
	tip403RegistryManifest,
	tip20FactoryManifest,
	tipFeeManagerManifest,
	stablecoinDexManifest,
	addressRegistryManifest,
	signatureVerifierManifest,
] as const satisfies ReadonlyArray<NativeContractManifestEntry>
