import { parseAbi, type Abi } from 'viem'
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
	addressDefinitionPaths: readonly string[]
	abiReferencePaths: readonly string[]
	registrationPaths: readonly string[]
	specificationPaths: readonly string[]
}

export type NativeContractManifestEntry = {
	id: string
	name: string
	runtimeType: NativeContractRuntimeType
	language: string
	abi: Abi
	repository: string
	commit: string
	commitUrl: string
	docsUrl?: string | undefined
	sourceRoot: string
	paths: readonly [string, ...string[]]
	entrypoints: readonly [string, ...string[]]
	deployments: readonly NativeContractDeployment[]
	references: NativeContractManifestReferences
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
	abiReferencePaths: readonly string[]
	specificationPaths?: readonly string[]
	registrationPaths?: readonly string[]
}): NativeContractManifestReferences {
	return {
		addressDefinitionPaths,
		abiReferencePaths: options.abiReferencePaths,
		registrationPaths: options.registrationPaths ?? registrationPaths,
		specificationPaths: options.specificationPaths ?? [],
	}
}

const validatorConfigAbi = Abis.validator

const validatorConfigV2Abi = parseAbi([
	'struct Validator { bytes32 publicKey; address validatorAddress; string ingress; string egress; address feeRecipient; uint64 index; uint64 addedAtHeight; uint64 deactivatedAtHeight; }',
	'function getActiveValidators() view returns (Validator[] validators)',
	'function getInitializedAtHeight() view returns (uint64)',
	'function owner() view returns (address)',
	'function validatorCount() view returns (uint64)',
	'function validatorByIndex(uint64 index) view returns (Validator validatorInfo)',
	'function validatorByAddress(address validatorAddress) view returns (Validator validatorInfo)',
	'function validatorByPublicKey(bytes32 publicKey) view returns (Validator validatorInfo)',
	'function getNextNetworkIdentityRotationEpoch() view returns (uint64)',
	'function isInitialized() view returns (bool)',
	'function addValidator(address validatorAddress, bytes32 publicKey, string ingress, string egress, address feeRecipient, bytes signature) returns (uint64 index)',
	'function deactivateValidator(uint64 idx)',
	'function rotateValidator(uint64 idx, bytes32 publicKey, string ingress, string egress, bytes signature)',
	'function setFeeRecipient(uint64 idx, address feeRecipient)',
	'function setIpAddresses(uint64 idx, string ingress, string egress)',
	'function transferValidatorOwnership(uint64 idx, address newAddress)',
	'function transferOwnership(address newOwner)',
	'function setNetworkIdentityRotationEpoch(uint64 epoch)',
	'function migrateValidator(uint64 idx)',
	'function initializeIfMigrated()',
	'event ValidatorAdded(uint64 indexed index, address indexed validatorAddress, bytes32 publicKey, string ingress, string egress, address feeRecipient)',
	'event ValidatorDeactivated(uint64 indexed index, address indexed validatorAddress)',
	'event ValidatorRotated(uint64 indexed index, uint64 indexed deactivatedIndex, address indexed validatorAddress, bytes32 oldPublicKey, bytes32 newPublicKey, string ingress, string egress, address caller)',
	'event FeeRecipientUpdated(uint64 indexed index, address feeRecipient, address caller)',
	'event IpAddressesUpdated(uint64 indexed index, string ingress, string egress, address caller)',
	'event ValidatorOwnershipTransferred(uint64 indexed index, address indexed oldAddress, address indexed newAddress, address caller)',
	'event OwnershipTransferred(address indexed oldOwner, address indexed newOwner)',
	'event ValidatorMigrated(uint64 indexed index, address indexed validatorAddress, bytes32 publicKey)',
	'event NetworkIdentityRotationEpochSet(uint64 indexed previousEpoch, uint64 indexed nextEpoch)',
	'event Initialized(uint64 height)',
	'event SkippedValidatorMigration(uint64 indexed index, address indexed validatorAddress, bytes32 publicKey)',
	'error AlreadyInitialized()',
	'error IngressAlreadyExists(string ingress)',
	'error EmptyV1ValidatorSet()',
	'error InvalidMigrationIndex()',
	'error InvalidOwner()',
	'error InvalidPublicKey()',
	'error InvalidSignature()',
	'error InvalidSignatureFormat()',
	'error InvalidValidatorAddress()',
	'error MigrationNotComplete()',
	'error NotInitialized()',
	'error NotIp(string input, string backtrace)',
	'error NotIpPort(string input, string backtrace)',
	'error PublicKeyAlreadyExists()',
	'error Unauthorized()',
	'error AddressAlreadyHasValidator()',
	'error ValidatorAlreadyDeactivated()',
	'error ValidatorNotFound()',
])

const accountKeychainAbi = Abis.accountKeychain

const nonceAbi = Abis.nonce

const tip403RegistryAbi = Abis.tip403Registry

const tip20FactoryAbi = Abis.tip20Factory

const tipFeeManagerAbi = [...Abis.feeManager, ...Abis.feeAmm]

const stablecoinDexAbi = Abis.stablecoinDex

const addressRegistryAbi = parseAbi([
	'function registerVirtualMaster(bytes32 salt) returns (bytes4 masterId)',
	'function getMaster(bytes4 masterId) view returns (address)',
	'function resolveRecipient(address to) view returns (address effectiveRecipient)',
	'function resolveVirtualAddress(address virtualAddr) view returns (address master)',
	'function isVirtualAddress(address addr) pure returns (bool)',
	'function decodeVirtualAddress(address addr) pure returns (bool isVirtual, bytes4 masterId, bytes6 userTag)',
	'event MasterRegistered(bytes4 indexed masterId, address indexed masterAddress)',
	'error MasterIdCollision(address master)',
	'error InvalidMasterAddress()',
	'error ProofOfWorkFailed()',
	'error VirtualAddressUnregistered()',
])

const signatureVerifierAbi = parseAbi([
	'function recover(bytes32 hash, bytes signature) view returns (address signer)',
	'function verify(address signer, bytes32 hash, bytes signature) view returns (bool)',
	'error InvalidFormat()',
	'error InvalidSignature()',
])

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
	language: 'Rust',
	abi: validatorConfigAbi,
	repository: tempoRepository,
	commit: tempoCommit,
	commitUrl: tempoCommitUrl,
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
] as const satisfies readonly NativeContractManifestEntry[]
