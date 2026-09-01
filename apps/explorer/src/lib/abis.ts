import { parseAbi } from 'viem'
import { Abis as ViemTempoAbis, Channel as ViemTempoChannel } from 'viem/tempo'
import { Abis as ViemZoneAbis } from 'viem-zones/tempo/zones'

export const tip20ChannelReserveAbi = ViemTempoAbis.tip20ChannelReserve
export const tip20ChannelReserveAddress = ViemTempoChannel.address

/** Semantic ABI for EIP-2935's selectorless raw-calldata read. */
export const blockHashHistoryAbi = parseAbi([
	'function getBlockHash(uint256 blockNumber) view returns (bytes32 blockHash)',
])

export const streamChannelAbi = [
	{
		type: 'event',
		name: 'ChannelOpened',
		inputs: [
			{ indexed: true, name: 'channelId', type: 'bytes32' },
			{ indexed: true, name: 'payer', type: 'address' },
			{ indexed: true, name: 'payee', type: 'address' },
			{ indexed: false, name: 'token', type: 'address' },
			{ indexed: false, name: 'authorizedSigner', type: 'address' },
			{ indexed: false, name: 'deposit', type: 'uint256' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'ChannelOpened',
		inputs: [
			{ indexed: true, name: 'channelId', type: 'bytes32' },
			{ indexed: true, name: 'payer', type: 'address' },
			{ indexed: true, name: 'payee', type: 'address' },
			{ indexed: false, name: 'token', type: 'address' },
			{ indexed: false, name: 'authorizedSigner', type: 'address' },
			{ indexed: false, name: 'salt', type: 'bytes32' },
			{ indexed: false, name: 'deposit', type: 'uint256' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'Settled',
		inputs: [
			{ indexed: true, name: 'channelId', type: 'bytes32' },
			{ indexed: true, name: 'payer', type: 'address' },
			{ indexed: true, name: 'payee', type: 'address' },
			{ indexed: false, name: 'cumulativeAmount', type: 'uint256' },
			{ indexed: false, name: 'deltaPaid', type: 'uint256' },
			{ indexed: false, name: 'newSettled', type: 'uint256' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'CloseRequested',
		inputs: [
			{ indexed: true, name: 'channelId', type: 'bytes32' },
			{ indexed: true, name: 'payer', type: 'address' },
			{ indexed: true, name: 'payee', type: 'address' },
			{ indexed: false, name: 'closeGraceEnd', type: 'uint256' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'TopUp',
		inputs: [
			{ indexed: true, name: 'channelId', type: 'bytes32' },
			{ indexed: true, name: 'payer', type: 'address' },
			{ indexed: true, name: 'payee', type: 'address' },
			{ indexed: false, name: 'additionalDeposit', type: 'uint256' },
			{ indexed: false, name: 'newDeposit', type: 'uint256' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'ChannelClosed',
		inputs: [
			{ indexed: true, name: 'channelId', type: 'bytes32' },
			{ indexed: true, name: 'payer', type: 'address' },
			{ indexed: true, name: 'payee', type: 'address' },
			{ indexed: false, name: 'settledToPayee', type: 'uint256' },
			{ indexed: false, name: 'refundedToPayer', type: 'uint256' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'CloseRequestCancelled',
		inputs: [
			{ indexed: true, name: 'channelId', type: 'bytes32' },
			{ indexed: true, name: 'payer', type: 'address' },
			{ indexed: true, name: 'payee', type: 'address' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'ChannelExpired',
		inputs: [
			{ indexed: true, name: 'channelId', type: 'bytes32' },
			{ indexed: true, name: 'payer', type: 'address' },
			{ indexed: true, name: 'payee', type: 'address' },
		],
		anonymous: false,
	},
] as const

const zonePortalEventsAbi = [
	{
		type: 'event',
		name: 'DepositMade',
		inputs: [
			{
				indexed: true,
				name: 'newCurrentDepositQueueHash',
				type: 'bytes32',
			},
			{ indexed: true, name: 'sender', type: 'address' },
			{ indexed: false, name: 'token', type: 'address' },
			{ indexed: false, name: 'to', type: 'address' },
			{ indexed: false, name: 'netAmount', type: 'uint128' },
			{ indexed: false, name: 'fee', type: 'uint128' },
			{ indexed: false, name: 'memo', type: 'bytes32' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'EncryptedDepositMade',
		inputs: [
			{
				indexed: true,
				name: 'newCurrentDepositQueueHash',
				type: 'bytes32',
			},
			{ indexed: true, name: 'sender', type: 'address' },
			{ indexed: false, name: 'token', type: 'address' },
			{ indexed: false, name: 'netAmount', type: 'uint128' },
			{ indexed: false, name: 'fee', type: 'uint128' },
			{ indexed: false, name: 'keyIndex', type: 'uint256' },
			{ indexed: false, name: 'ephemeralPubkeyX', type: 'bytes32' },
			{ indexed: false, name: 'ephemeralPubkeyYParity', type: 'uint8' },
			{ indexed: false, name: 'ciphertext', type: 'bytes' },
			{ indexed: false, name: 'nonce', type: 'bytes12' },
			{ indexed: false, name: 'tag', type: 'bytes16' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'BatchSubmitted',
		inputs: [
			{ indexed: true, name: 'withdrawalBatchIndex', type: 'uint64' },
			{
				indexed: false,
				name: 'nextProcessedDepositQueueHash',
				type: 'bytes32',
			},
			{ indexed: false, name: 'nextBlockHash', type: 'bytes32' },
			{ indexed: false, name: 'withdrawalQueueHash', type: 'bytes32' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'WithdrawalProcessed',
		inputs: [
			{ indexed: true, name: 'to', type: 'address' },
			{ indexed: false, name: 'token', type: 'address' },
			{ indexed: false, name: 'amount', type: 'uint128' },
			{ indexed: false, name: 'callbackSuccess', type: 'bool' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'BounceBack',
		inputs: [
			{
				indexed: true,
				name: 'newCurrentDepositQueueHash',
				type: 'bytes32',
			},
			{ indexed: true, name: 'fallbackRecipient', type: 'address' },
			{ indexed: false, name: 'token', type: 'address' },
			{ indexed: false, name: 'amount', type: 'uint128' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'SequencerTransferred',
		inputs: [
			{ indexed: true, name: 'previousSequencer', type: 'address' },
			{ indexed: true, name: 'newSequencer', type: 'address' },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'TokenEnabled',
		inputs: [
			{ indexed: true, name: 'token', type: 'address' },
			{ indexed: false, name: 'name', type: 'string' },
			{ indexed: false, name: 'symbol', type: 'string' },
			{ indexed: false, name: 'currency', type: 'string' },
		],
		anonymous: false,
	},
] as const

const zonePortalCurrentAbi = parseAbi([
	'event BatchSubmitted(uint64 indexed withdrawalBatchIndex, uint256 indexed withdrawalQueueIndex, bytes32 nextProcessedDepositQueueHash, bytes32 nextBlockHash, bytes32 withdrawalQueueHash, uint64 lastProcessedDepositNumber)',
	'event WithdrawalBounceBack(bytes32 indexed newCurrentDepositQueueHash, uint64 indexed fallbackNonce, address token, uint128 amount, uint64 depositNumber)',
	'event AdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin)',
	'event AdminTransferred(address indexed previousAdmin, address indexed newAdmin)',
	'event DepositMade(bytes32 indexed newCurrentDepositQueueHash, address indexed sender, address token, uint128 netAmount, uint128 fee, uint256 keyIndex, bytes32 ephemeralPubkeyX, uint8 ephemeralPubkeyYParity, bytes ciphertext, bytes12 nonce, bytes16 tag, address tempoRefundRecipient, uint64 depositNumber)',
	'event DepositBounceBack(address indexed tempoRefundRecipient, address token, uint128 amount, uint128 bouncebackFee)',
	'event DepositBounceBackPending(address indexed tempoRefundRecipient, address token, uint128 amount, uint128 bouncebackFee)',
	'event RefundClaimed(address indexed recipient, address indexed token, uint128 amount)',
	'event SequencerEncryptionKeyUpdated(bytes32 x, uint8 yParity, address pubkey, uint256 keyIndex, uint64 activationBlock)',
	'event ZoneGasRateUpdated(uint128 zoneGasRate)',
	'event MaxTempoGasRateUpdated(uint128 maxTempoGasRate)',
	'event BouncebackGasUpdated(uint64 bouncebackGas)',
	'event DepositsPaused(address indexed token)',
	'event DepositsResumed(address indexed token)',
	'event PortalPaused(address indexed account)',
	'event PortalResumed(address indexed account)',
	'event AbdicationScheduled(uint8 indexed capability, uint64 effectiveAt)',
	'event RpcUrlUpdated(string rpcUrl)',
	'event SequencerSetUpdated(uint64 indexed nonce, uint8 threshold, address[] sequencers)',
	'event LeaderUpdated(address indexed previousLeader, address indexed newLeader, uint64 indexed epoch, uint64 activationTempoBlock)',
	'event EnforcementModesUpdated(bool accessMode, bool gatewayMode)',
	'event RoleUpdated(address indexed account, uint8 prev, uint8 next)',
	'function deposit(address token, uint128 amount, uint256 keyIndex, (bytes32 ephemeralPubkeyX, uint8 ephemeralPubkeyYParity, bytes ciphertext, bytes12 nonce, bytes16 tag) encrypted, address tempoRefundRecipient) returns (bytes32 newCurrentDepositQueueHash)',
	'function processWithdrawals((address token, bytes32 senderTag, address to, uint128 amount, bytes32 memo, uint64 gasLimit, uint64 fallbackNonce, bytes callbackData, bytes encryptedSender)[] withdrawals, bytes32 remainingQueue)',
	'function deliverWithdrawal(address token, address target, uint128 amount, bytes32 senderTag, uint64 gasLimit, bytes data)',
	'function submitBatch(uint64 tempoBlockNumber, uint64 recentTempoBlockNumber, (bytes32 prevBlockHash, bytes32 nextBlockHash) blockTransition, (bytes32 prevProcessedHash, bytes32 nextProcessedHash, uint64 prevDepositNumber, uint64 nextDepositNumber) depositQueueTransition, bytes32 withdrawalQueueHash, bytes verifierConfig, bytes proof, uint256 zoneHeight, bytes[] signatures)',
])

export const zonePortalActivityAbi = parseAbi([
	'event DepositMade(bytes32 indexed newCurrentDepositQueueHash, address indexed sender, address token, uint128 netAmount, uint128 fee, uint256 keyIndex, bytes32 ephemeralPubkeyX, uint8 ephemeralPubkeyYParity, bytes ciphertext, bytes12 nonce, bytes16 tag, address tempoRefundRecipient, uint64 depositNumber)',
	'event BatchSubmitted(uint64 indexed withdrawalBatchIndex, uint256 indexed withdrawalQueueIndex, bytes32 nextProcessedDepositQueueHash, bytes32 nextBlockHash, bytes32 withdrawalQueueHash, uint64 lastProcessedDepositNumber)',
	'event WithdrawalProcessed(address indexed to, bytes32 indexed senderTag, address token, uint128 amount, bool callbackSuccess)',
])

export const zonePortalReadAbi = parseAbi([
	'function enabledTokenCount() view returns (uint256)',
	'function enabledTokenAt(uint256 index) view returns (address)',
])

export const zoneFactoryRegistryAbi = parseAbi([
	'function isZonePortal(address portal) view returns (bool)',
])

export const zoneMessengerAbi = parseAbi([
	'function relayMessage(uint32 zoneId, address token, bytes32 senderTag, address target, uint128 amount, uint64 gasLimit, bytes data)',
])

export const zoneVerifierAbi = parseAbi([
	'function verify(uint32 zoneId, uint64 tempoBlockNumber, uint64 anchorBlockNumber, bytes32 anchorBlockHash, uint64 expectedWithdrawalBatchIndex, (bytes32 prevBlockHash, bytes32 nextBlockHash) blockTransition, (bytes32 prevProcessedHash, bytes32 nextProcessedHash, uint64 prevDepositNumber, uint64 nextDepositNumber) depositQueueTransition, bytes32 withdrawalQueueHash, bytes verifierConfig, bytes proof) view returns (bool)',
])

export const stablecoinDexAbi = ViemTempoAbis.stablecoinDex
export const zoneFactoryAbi = ViemZoneAbis.zoneFactory
export const zoneOutboxAbi = ViemZoneAbis.zoneOutbox
export const zonePortalAbi = [
	...zonePortalEventsAbi,
	...ViemZoneAbis.zonePortal,
	...zonePortalCurrentAbi,
] as const

export const receivePolicyGuardAbi = parseAbi([
	'event TransferBlocked(address indexed token, address indexed receiver, uint64 indexed blockedNonce, uint256 amount, uint8 receiptVersion, bytes receipt)',
	'event ReceiptClaimed(address indexed token, address indexed receiver, uint8 receiptVersion, uint64 indexed blockedNonce, uint64 blockedAt, address originator, address recipient, address recoveryAuthority, address caller, address to, uint256 amount)',
	'event ReceiptBurned(address indexed token, address indexed receiver, uint8 receiptVersion, uint64 indexed blockedNonce, uint64 blockedAt, address originator, address recipient, address recoveryAuthority, address caller, uint256 amount)',
])

// Customer-agnostic Tempo Earn events. These are bundled separately from viem's
// protocol ABIs so transaction logs remain readable before or without contract
// verification. Standard Ownable events are intentionally omitted because their
// selectors do not identify an Earn contract.
export const earnEventsAbi = parseAbi([
	'event ActiveSet(bool active)',
	'event AssetsFunded(address indexed funder, uint256 assets, uint256 earnShares)',
	'event AuthorizedForwarderChanged(address indexed account, bool authorized)',
	'event AuthorizedSolverChanged(address indexed account, bool authorized)',
	'event BatchPushed(uint64 indexed version, bytes32 indexed batchHash, uint256 attemptedCount, uint256 paidCount, uint256 paidEarnShares, uint256 skippedCount)',
	'event Contributed(address indexed caller, uint256 assets, uint256 engineShares, uint256 anchorEngineShares, uint256 anchorEarnShares)',
	'event ContributionControllerInstalled(address indexed earnVault, address indexed owner, address contributionController)',
	'event DeficitFundingSettled(address indexed solver, address indexed asset, uint256 funded, uint256 used, uint256 refunded)',
	'event DepositPauseChanged(address indexed caller, bool paused)',
	'event Deposited(address indexed caller, address indexed receiver, uint256 assets, uint256 earnShares)',
	'event Deposited(address indexed earnVault, uint256 assets, uint256 engineShares)',
	'event DistributorFeeUpdateCancelled(address indexed distributor)',
	'event DistributorFeeUpdateScheduled(address indexed distributor, address indexed recipient, uint16 rateBps, uint40 executableAt)',
	'event DistributorFeeUpdated(address indexed recipient, uint16 rateBps, uint64 indexed feeConfigId)',
	'event DistributorTransferCancelled(address indexed distributor, address indexed pendingDistributor)',
	'event DistributorTransferStarted(address indexed distributor, address indexed pendingDistributor)',
	'event DistributorTransferred(address indexed previousDistributor, address indexed newDistributor)',
	'event DustSwept(address indexed token, address indexed to, uint256 amount)',
	'event ERC4626EngineDeployed(address indexed engine, address indexed vault, address indexed owner, address asset, bytes32 deploymentId, bytes32 engineSalt)',
	'event EarnDeposit(bytes32 indexed actionId, address indexed earnVault, address indexed inputToken, uint256 inputAmount, uint256 vaultAssets, uint256 earnShares, bytes32 zoneDepositHash)',
	'event EarnRedeem(bytes32 indexed actionId, address indexed earnVault, address indexed outputToken, uint256 earnShares, uint256 vaultAssets, uint256 outputAmount, bytes32 zoneDepositHash)',
	'event EarnStackDeployed(address indexed earnVault, address indexed earnShare, address indexed earnFees, address engine, address asset, address owner, bytes32 deploymentId, address emergencyGuardian, address asyncJanitor, uint256 maxManagedAssets, uint8 migrationMode, uint64 transferPolicyId, bytes32 earnShareSalt, bytes32 controlConfigHash, bytes32 feeConfigHash, bytes32 earnFeesSalt)',
	'event EarnVaultInitialized(address indexed earnVault)',
	'event EarnVaultInitialized(address indexed engine, address indexed earnShare, address indexed earnFees, address operator, address emergencyGuardian, address asyncJanitor, uint256 maxManagedAssets, uint8 migrationMode, address distributor, uint40 distributorUpdateDelay, address distributorFeeRecipient, uint16 distributorFeeRateBps)',
	'event EmergencyRolesChanged(address indexed emergencyGuardian, address indexed asyncJanitor)',
	'event EngineMigrated(address indexed oldEngine, address indexed newEngine, uint256 oldEngineShares, uint256 assetsMoved, uint256 newEngineShares, uint256 totalEarnShares, uint256 anchorEngineShares, uint256 anchorEarnShares)',
	'event EngineShareShortfallReconciled(address indexed engine, uint256 previousManagedEngineShares, uint256 observedRawEngineShares, uint256 shortfallEngineShares, uint256 totalEarnShares)',
	'event EngineShareSurplusAbsorbed(address indexed caller, uint256 engineShares, uint256 anchorEngineShares, uint256 anchorEarnShares)',
	'event ExternalSettlementRecovered(uint256 requestCount, uint256 recoveredAssets, uint256 claimed)',
	'event FeeBaselinesInitialized(uint256 highWaterMark, uint256 targetBase, uint40 targetStartedAt)',
	'event FeeConfigurationSet(uint64 indexed configId, bytes32 indexed configHash, bool reactivated)',
	'event FeeDustWaived(uint64 indexed configId, uint8 indexed slot, uint256 remainder)',
	'event FeeEarnSharesAllocated(uint64 indexed configId, address indexed recipient, uint256 feeAssets, uint256 feeEarnShares)',
	'event FeeEarnSharesClaimed(address indexed recipient, address indexed to, uint256 earnShares)',
	'event FeesAccrued(uint64 indexed configId, uint256 activeAssets, uint256 positiveAccrualAssets, uint256 feeAssets, uint256 feeEarnShares, uint256 highWaterMark, uint256 targetValuePerEarnShare)',
	'event FeesDisabled(address indexed operator)',
	'event FinalizeFailed(bytes32 indexed requestId, address indexed asset, uint256 amount)',
	'event Finalized(bytes32 indexed requestId, address indexed asset, uint256 amount)',
	'event Funded(address indexed funder, uint256 requestedAssets, uint256 fundedAssets)',
	'event MaxManagedAssetsChanged(uint256 previousMaxManagedAssets, uint256 newMaxManagedAssets)',
	'event MaxRateAgeUpdated(uint64 oldMaxRateAge, uint64 newMaxRateAge)',
	'event MerkleDistributorInstalled(address indexed earnVault, address indexed owner, address indexed treasury, address merkleDistributor, bytes32 campaignId, uint40 claimDeadline)',
	'event OperatorTransferCancelled(address indexed operator, address indexed pendingOperator)',
	'event OperatorTransferStarted(address indexed operator, address indexed pendingOperator)',
	'event OperatorTransferred(address indexed previousOperator, address indexed newOperator)',
	'event PausedSet(bool paused)',
	'event PayoutSkipped(address indexed recipient, uint256 cumulativeAmount, uint8 reason)',
	'event RedeemCancelled(bytes32 indexed requestId, address indexed receiver, uint256 earnShares)',
	'event RedeemCancelledOnQueue(bytes32 indexed requestId, uint128 engineShares)',
	'event RedeemClaimed(bytes32 indexed requestId, address indexed asset, uint256 amount)',
	'event RedeemFinalized(bytes32 indexed requestId, address indexed receiver, uint256 earnShares, address asset, uint256 assets)',
	'event RedeemRequested(bytes32 indexed requestId, address indexed assetOut, uint128 engineShares)',
	'event RedeemRequested(bytes32 indexed requestId, address indexed requester, address indexed receiver, uint256 earnShares)',
	'event Redeemed(address indexed caller, address indexed receiver, uint256 earnShares, uint256 assets)',
	'event Redeemed(address indexed receiver, uint256 engineShares, uint256 assets)',
	'event Rescued(address indexed token, address indexed to, uint256 amount)',
	'event RewardClaimed(address indexed recipient, uint256 amount, uint256 cumulativeAmount)',
	'event RootPublished(uint64 indexed version, bytes32 indexed root, bytes32 indexed statementHash, uint256 totalEntitlement)',
	'event Settled(address indexed asset, uint256 amount, uint256 newTotal)',
	'event SolvedAndForwarded(uint256 requestCount, uint256 forwardedCount, address indexed caller)',
	'event TreasuryChanged(address indexed oldTreasury, address indexed newTreasury)',
	'event Unearmarked(address indexed asset, uint256 amount, uint256 newTotal)',
	'event UnspentReturned(address indexed treasury, uint256 earnShares)',
	'event VedaEngineBound(address indexed engine)',
	'event VedaEngineInitialized(address indexed teller, address indexed queue, address indexed accountant, uint64 peripheryVersion, uint64 maxRateAge)',
	'event VedaPeripheryPublished(uint64 indexed version, address indexed teller, address indexed queue, address accountant)',
	'event VedaPeripheryUpdated(uint64 indexed registryVersion, address indexed oldTeller, address indexed oldQueue, address oldAccountant, address newTeller, address newQueue, address newAccountant, uint256 validatedRate)',
	'event VenueSharesDeposited(address indexed caller, address indexed receiver, uint256 requestedVenueShares, uint256 receivedEngineShares, uint256 earnShares)',
	'event VenueSharesDeposited(address indexed from, uint256 requestedVenueShares, uint256 receivedEngineShares)',
	'event WithdrewExact(address indexed caller, address indexed receiver, uint256 assets, uint256 earnSharesBurned)',
	'event WithdrewExact(address indexed receiver, uint256 assets, uint256 engineSharesBurned)',
])

export const Abis = {
	...ViemTempoAbis,
	earn: earnEventsAbi,
	receivePolicyGuard: receivePolicyGuardAbi,
	stablecoinDex: stablecoinDexAbi,
	streamChannel: streamChannelAbi,
	zoneFactory: zoneFactoryAbi.filter((item) => item.type === 'event'),
	zoneOutbox: zoneOutboxAbi.filter((item) => item.type === 'event'),
	zonePortal: zonePortalAbi.filter((item) => item.type === 'event'),
} as const

export const allAbis = Object.values(Abis).flat()

export const TOKEN_CREATED_EVENT =
	'event TokenCreated(address indexed token, string name, string symbol, string currency, address quoteToken, address admin, bytes32 salt)'

export function getTokenCreatedEvent(_chainId: number): string {
	return TOKEN_CREATED_EVENT
}
