import { parseAbi } from 'viem'
import { Abis as ViemTempoAbis, Channel as ViemTempoChannel } from 'viem/tempo'
import { Abis as ViemZoneAbis } from 'viem-zones/tempo/zones'

export const tip20ChannelReserveAbi = ViemTempoAbis.tip20ChannelReserve
export const tip20ChannelReserveAddress = ViemTempoChannel.address

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
	'function processWithdrawals((address token, bytes32 senderTag, address to, uint128 amount, bytes32 memo, uint64 gasLimit, uint64 fallbackNonce, bytes callbackData, bytes encryptedSender)[] withdrawals, bytes32 remainingQueue)',
	'function deliverWithdrawal(address token, address target, uint128 amount, bytes32 senderTag, uint64 gasLimit, bytes data)',
	'function submitBatch(uint64 tempoBlockNumber, uint64 recentTempoBlockNumber, (bytes32 prevBlockHash, bytes32 nextBlockHash) blockTransition, (bytes32 prevProcessedHash, bytes32 nextProcessedHash, uint64 prevDepositNumber, uint64 nextDepositNumber) depositQueueTransition, bytes32 withdrawalQueueHash, bytes verifierConfig, bytes proof, uint256 zoneHeight, bytes[] signatures)',
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

export const Abis = {
	...ViemTempoAbis,
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
