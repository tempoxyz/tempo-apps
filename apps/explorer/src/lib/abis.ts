import { parseAbi } from 'viem'
import { Abis as ViemTempoAbis, Channel as ViemTempoChannel } from 'viem/tempo'

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

// Retain superseded event signatures so historical Zone Portal activity remains
// decodable; current functions and events come from viem.
const legacyZonePortalEventsAbi = [
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

export const zoneMessengerAbi = ViemTempoAbis.zoneMessenger
export const zoneVerifierAbi = ViemTempoAbis.zoneVerifier

export const stablecoinDexAbi = ViemTempoAbis.stablecoinDex
export const zoneFactoryAbi = ViemTempoAbis.zoneFactory
export const zoneOutboxAbi = ViemTempoAbis.zoneOutbox
export const zonePortalAbi = [
	...legacyZonePortalEventsAbi,
	...ViemTempoAbis.zonePortal,
] as const

export const receivePolicyGuardAbi = parseAbi([
	'event TransferBlocked(address indexed token, address indexed receiver, uint64 indexed blockedNonce, uint256 amount, uint8 receiptVersion, bytes receipt)',
	'event ReceiptClaimed(address indexed token, address indexed receiver, uint8 receiptVersion, uint64 indexed blockedNonce, uint64 blockedAt, address originator, address recipient, address recoveryAuthority, address caller, address to, uint256 amount)',
	'event ReceiptBurned(address indexed token, address indexed receiver, uint8 receiptVersion, uint64 indexed blockedNonce, uint64 blockedAt, address originator, address recipient, address recoveryAuthority, address caller, uint256 amount)',
])

export const Abis = {
	accountKeychain: ViemTempoAbis.accountKeychain,
	feeAmm: ViemTempoAbis.feeAmm,
	feeManager: ViemTempoAbis.feeManager,
	nonce: ViemTempoAbis.nonce,
	receivePolicyGuard: receivePolicyGuardAbi,
	signatureVerifier: ViemTempoAbis.signatureVerifier,
	stablecoinDex: stablecoinDexAbi,
	storageCredits: ViemTempoAbis.storageCredits,
	streamChannel: streamChannelAbi,
	tip20: ViemTempoAbis.tip20,
	tip20ChannelReserve: ViemTempoAbis.tip20ChannelReserve,
	tip20Factory: ViemTempoAbis.tip20Factory,
	tip403Registry: ViemTempoAbis.tip403Registry,
	validatorConfig: ViemTempoAbis.validatorConfig,
	validatorConfigV2: ViemTempoAbis.validatorConfigV2,
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
