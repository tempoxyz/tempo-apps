import { parseAbi, type Abi } from 'viem'

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

const validatorConfigAbi = parseAbi([
	'struct Validator { bytes32 publicKey; bool active; uint64 index; address validatorAddress; string inboundAddress; string outboundAddress; }',
	'function getValidators() view returns (Validator[] validators)',
	'function addValidator(address newValidatorAddress, bytes32 publicKey, bool active, string inboundAddress, string outboundAddress)',
	'function updateValidator(address newValidatorAddress, bytes32 publicKey, string inboundAddress, string outboundAddress)',
	'function changeValidatorStatus(address validator, bool active)',
	'function changeValidatorStatusByIndex(uint64 index, bool active)',
	'function owner() view returns (address)',
	'function changeOwner(address newOwner)',
	'function getNextFullDkgCeremony() view returns (uint64)',
	'function setNextFullDkgCeremony(uint64 epoch)',
	'function validatorsArray(uint256 index) view returns (address)',
	'function validators(address validator) view returns (Validator validatorInfo)',
	'function validatorCount() view returns (uint64)',
	'error Unauthorized()',
	'error ValidatorAlreadyExists()',
	'error ValidatorNotFound()',
	'error InvalidPublicKey()',
	'error NotHostPort(string field, string input, string backtrace)',
	'error NotIpPort(string field, string input, string backtrace)',
])

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

const accountKeychainAbi = parseAbi([
	'struct LegacyTokenLimit { address token; uint256 amount; }',
	'struct TokenLimit { address token; uint256 amount; uint64 period; }',
	'struct SelectorRule { bytes4 selector; address[] recipients; }',
	'struct CallScope { address target; SelectorRule[] selectorRules; }',
	'struct KeyRestrictions { uint64 expiry; bool enforceLimits; TokenLimit[] limits; bool allowAnyCalls; CallScope[] allowedCalls; }',
	'struct KeyInfo { uint8 signatureType; address keyId; uint64 expiry; bool enforceLimits; bool isRevoked; }',
	'function authorizeKey(address keyId, uint8 signatureType, uint64 expiry, bool enforceLimits, LegacyTokenLimit[] limits)',
	'function authorizeKey(address keyId, uint8 signatureType, KeyRestrictions config)',
	'function revokeKey(address keyId)',
	'function updateSpendingLimit(address keyId, address token, uint256 newLimit)',
	'function setAllowedCalls(address keyId, CallScope[] scopes)',
	'function removeAllowedCalls(address keyId, address target)',
	'function getKey(address account, address keyId) view returns (KeyInfo keyInfo)',
	'function getRemainingLimit(address account, address keyId, address token) view returns (uint256 remaining)',
	'function getRemainingLimitWithPeriod(address account, address keyId, address token) view returns (uint256 remaining, uint64 periodEnd)',
	'function getAllowedCalls(address account, address keyId) view returns (bool isScoped, CallScope[] scopes)',
	'function getTransactionKey() view returns (address)',
	'event KeyAuthorized(address indexed account, address indexed publicKey, uint8 signatureType, uint64 expiry)',
	'event KeyRevoked(address indexed account, address indexed publicKey)',
	'event SpendingLimitUpdated(address indexed account, address indexed publicKey, address indexed token, uint256 newLimit)',
	'event AccessKeySpend(address indexed account, address indexed publicKey, address indexed token, uint256 amount, uint256 remainingLimit)',
	'error UnauthorizedCaller()',
	'error KeyAlreadyExists()',
	'error KeyNotFound()',
	'error KeyExpired()',
	'error SpendingLimitExceeded()',
	'error InvalidSpendingLimit()',
	'error InvalidSignatureType()',
	'error ZeroPublicKey()',
	'error ExpiryInPast()',
	'error KeyAlreadyRevoked()',
	'error SignatureTypeMismatch(uint8 expected, uint8 actual)',
	'error CallNotAllowed()',
	'error InvalidCallScope()',
	'error LegacyAuthorizeKeySelectorChanged(bytes4 newSelector)',
])

const nonceAbi = parseAbi([
	'function getNonce(address account, uint256 nonceKey) view returns (uint64 nonce)',
	'event NonceIncremented(address indexed account, uint256 indexed nonceKey, uint64 newNonce)',
	'error ProtocolNonceNotSupported()',
	'error InvalidNonceKey()',
	'error NonceOverflow()',
	'error ExpiringNonceReplay()',
	'error ExpiringNonceSetFull()',
	'error InvalidExpiringNonceExpiry()',
])

const tip403RegistryAbi = parseAbi([
	'function policyIdCounter() view returns (uint64)',
	'function policyExists(uint64 policyId) view returns (bool)',
	'function policyData(uint64 policyId) view returns (uint8 policyType, address admin)',
	'function isAuthorized(uint64 policyId, address user) view returns (bool)',
	'function isAuthorizedSender(uint64 policyId, address user) view returns (bool)',
	'function isAuthorizedRecipient(uint64 policyId, address user) view returns (bool)',
	'function isAuthorizedMintRecipient(uint64 policyId, address user) view returns (bool)',
	'function compoundPolicyData(uint64 policyId) view returns (uint64 senderPolicyId, uint64 recipientPolicyId, uint64 mintRecipientPolicyId)',
	'function createPolicy(address admin, uint8 policyType) returns (uint64)',
	'function createPolicyWithAccounts(address admin, uint8 policyType, address[] accounts) returns (uint64)',
	'function setPolicyAdmin(uint64 policyId, address admin)',
	'function modifyPolicyWhitelist(uint64 policyId, address account, bool allowed)',
	'function modifyPolicyBlacklist(uint64 policyId, address account, bool restricted)',
	'function createCompoundPolicy(uint64 senderPolicyId, uint64 recipientPolicyId, uint64 mintRecipientPolicyId) returns (uint64)',
	'event PolicyAdminUpdated(uint64 indexed policyId, address indexed updater, address indexed admin)',
	'event PolicyCreated(uint64 indexed policyId, address indexed updater, uint8 policyType)',
	'event WhitelistUpdated(uint64 indexed policyId, address indexed updater, address indexed account, bool allowed)',
	'event BlacklistUpdated(uint64 indexed policyId, address indexed updater, address indexed account, bool restricted)',
	'event CompoundPolicyCreated(uint64 indexed policyId, address indexed creator, uint64 senderPolicyId, uint64 recipientPolicyId, uint64 mintRecipientPolicyId)',
	'error Unauthorized()',
	'error PolicyNotFound()',
	'error PolicyNotSimple()',
	'error InvalidPolicyType()',
	'error IncompatiblePolicyType()',
	'error VirtualAddressNotAllowed()',
])

const tip20FactoryAbi = parseAbi([
	'function createToken(string name, string symbol, string currency, address quoteToken, address admin, bytes32 salt) returns (address)',
	'function isTIP20(address token) view returns (bool)',
	'function getTokenAddress(address sender, bytes32 salt) view returns (address)',
	'event TokenCreated(address indexed token, string name, string symbol, string currency, address quoteToken, address admin, bytes32 salt)',
	'error AddressReserved()',
	'error AddressNotReserved()',
	'error InvalidQuoteToken()',
	'error TokenAlreadyExists(address token)',
])

const tipFeeManagerAbi = parseAbi([
	'struct Pool { uint128 reserveUserToken; uint128 reserveValidatorToken; }',
	'function userTokens(address user) view returns (address)',
	'function validatorTokens(address validator) view returns (address)',
	'function setUserToken(address token)',
	'function setValidatorToken(address token)',
	'function distributeFees(address validator, address token)',
	'function collectedFees(address validator, address token) view returns (uint256)',
	'function M() view returns (uint256)',
	'function N() view returns (uint256)',
	'function SCALE() view returns (uint256)',
	'function MIN_LIQUIDITY() view returns (uint256)',
	'function getPoolId(address userToken, address validatorToken) pure returns (bytes32)',
	'function getPool(address userToken, address validatorToken) view returns (Pool pool)',
	'function pools(bytes32 poolId) view returns (Pool pool)',
	'function mint(address userToken, address validatorToken, uint256 amountValidatorToken, address to) returns (uint256 liquidity)',
	'function burn(address userToken, address validatorToken, uint256 liquidity, address to) returns (uint256 amountUserToken, uint256 amountValidatorToken)',
	'function totalSupply(bytes32 poolId) view returns (uint256)',
	'function liquidityBalances(bytes32 poolId, address user) view returns (uint256)',
	'function rebalanceSwap(address userToken, address validatorToken, uint256 amountOut, address to) returns (uint256 amountIn)',
	'event UserTokenSet(address indexed user, address indexed token)',
	'event ValidatorTokenSet(address indexed validator, address indexed token)',
	'event FeesDistributed(address indexed validator, address indexed token, uint256 amount)',
	'event Mint(address sender, address indexed to, address indexed userToken, address indexed validatorToken, uint256 amountValidatorToken, uint256 liquidity)',
	'event Burn(address indexed sender, address indexed userToken, address indexed validatorToken, uint256 amountUserToken, uint256 amountValidatorToken, uint256 liquidity, address to)',
	'event RebalanceSwap(address indexed userToken, address indexed validatorToken, address indexed swapper, uint256 amountIn, uint256 amountOut)',
	'error OnlyValidator()',
	'error OnlySystemContract()',
	'error InvalidToken()',
	'error PoolDoesNotExist()',
	'error InsufficientFeeTokenBalance()',
	'error InternalError()',
	'error CannotChangeWithinBlock()',
	'error CannotChangeWithPendingFees()',
	'error TokenPolicyForbids()',
	'error IdenticalAddresses()',
	'error InsufficientLiquidity()',
	'error InsufficientReserves()',
	'error InvalidAmount()',
	'error DivisionByZero()',
	'error InvalidSwapCalculation()',
])

const stablecoinDexAbi = parseAbi([
	'struct Order { uint128 orderId; address maker; bytes32 bookKey; bool isBid; int16 tick; uint128 amount; uint128 remaining; uint128 prev; uint128 next; bool isFlip; int16 flipTick; }',
	'struct Orderbook { address base; address quote; int16 bestBidTick; int16 bestAskTick; }',
	'function createPair(address base) returns (bytes32 key)',
	'function place(address token, uint128 amount, bool isBid, int16 tick) returns (uint128 orderId)',
	'function placeFlip(address token, uint128 amount, bool isBid, int16 tick, int16 flipTick) returns (uint128 orderId)',
	'function cancel(uint128 orderId)',
	'function cancelStaleOrder(uint128 orderId)',
	'function swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut) returns (uint128 amountOut)',
	'function swapExactAmountOut(address tokenIn, address tokenOut, uint128 amountOut, uint128 maxAmountIn) returns (uint128 amountIn)',
	'function quoteSwapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn) view returns (uint128 amountOut)',
	'function quoteSwapExactAmountOut(address tokenIn, address tokenOut, uint128 amountOut) view returns (uint128 amountIn)',
	'function balanceOf(address user, address token) view returns (uint128)',
	'function withdraw(address token, uint128 amount)',
	'function getOrder(uint128 orderId) view returns (Order order)',
	'function getTickLevel(address base, int16 tick, bool isBid) view returns (uint128 head, uint128 tail, uint128 totalLiquidity)',
	'function pairKey(address tokenA, address tokenB) pure returns (bytes32)',
	'function nextOrderId() view returns (uint128)',
	'function books(bytes32 pairKey) view returns (Orderbook orderbook)',
	'function MIN_TICK() pure returns (int16)',
	'function MAX_TICK() pure returns (int16)',
	'function TICK_SPACING() pure returns (int16)',
	'function PRICE_SCALE() pure returns (uint32)',
	'function MIN_ORDER_AMOUNT() pure returns (uint128)',
	'function MIN_PRICE() pure returns (uint32)',
	'function MAX_PRICE() pure returns (uint32)',
	'function tickToPrice(int16 tick) pure returns (uint32 price)',
	'function priceToTick(uint32 price) pure returns (int16 tick)',
	'event PairCreated(bytes32 indexed key, address indexed base, address indexed quote)',
	'event OrderPlaced(uint128 indexed orderId, address indexed maker, address indexed token, uint128 amount, bool isBid, int16 tick, bool isFlipOrder, int16 flipTick)',
	'event OrderFilled(uint128 indexed orderId, address indexed maker, address indexed taker, uint128 amountFilled, bool partialFill)',
	'event OrderCancelled(uint128 indexed orderId)',
	'error Unauthorized()',
	'error PairDoesNotExist()',
	'error PairAlreadyExists()',
	'error OrderDoesNotExist()',
	'error IdenticalTokens()',
	'error InvalidToken()',
	'error TickOutOfBounds(int16 tick)',
	'error InvalidTick()',
	'error InvalidFlipTick()',
	'error InsufficientBalance()',
	'error InsufficientLiquidity()',
	'error InsufficientOutput()',
	'error MaxInputExceeded()',
	'error BelowMinimumOrderSize(uint128 amount)',
	'error InvalidBaseToken()',
	'error OrderNotStale()',
])

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

const validatorConfigAddress =
	'0xcccccccc00000000000000000000000000000000' as const
const validatorConfigV2Address =
	'0xcccccccc00000000000000000000000000000001' as const
const accountKeychainAddress =
	'0xaaaaaaaa00000000000000000000000000000000' as const
const nonceManagerAddress =
	'0x4e4f4e4345000000000000000000000000000000' as const
const tip403RegistryAddress =
	'0x403c000000000000000000000000000000000000' as const
const tip20FactoryAddress =
	'0x20fc000000000000000000000000000000000000' as const
const tipFeeManagerAddress =
	'0xfeec000000000000000000000000000000000000' as const
const stablecoinDexAddress =
	'0xdec0000000000000000000000000000000000000' as const
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
