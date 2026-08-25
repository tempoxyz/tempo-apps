import type { Address, Hex } from 'ox'
import {
	decodeFunctionData,
	encodeAbiParameters,
	keccak256,
	parseAbi,
	parseAbiParameters,
} from 'viem'

const zonePortalPrefix = '0x5ad000000000000000000000' as const
const maxZoneId = 0xffff_ffffn

const processWithdrawalsAbi = parseAbi([
	'function processWithdrawals((address token, bytes32 senderTag, address to, uint128 amount, bytes32 memo, uint64 gasLimit, uint64 fallbackNonce, bytes callbackData, bytes encryptedSender)[] withdrawals, bytes32 remainingQueue)',
])

const withdrawalQueueHashParameters = parseAbiParameters(
	'(address token, bytes32 senderTag, address to, uint128 amount, bytes32 memo, uint64 gasLimit, uint64 fallbackNonce, bytes callbackData, bytes encryptedSender) withdrawal, bytes32 remainingQueue',
)

export type ZonePortalActivityKind = 'deposits' | 'withdrawals' | 'batches'

export type ZonePortalAsset = {
	address: Address.Address
	balance: string
	decimals: number
	symbol: string
}

export type ZonePortalOverview = {
	isZonePortal: true
	assets: ZonePortalAsset[]
	counts: {
		deposits: number
		withdrawals: number
		batches: number
	}
}

export type ZonePortalBatchReference = {
	index: string
	transactionHash: Hex.Hex
}

export type ZonePortalDeposit = {
	kind: 'deposit'
	timestamp: number
	transactionHash: Hex.Hex
	sender: Address.Address
	token: Address.Address
	amount: string
	processedInBatch: ZonePortalBatchReference | null
}

export type ZonePortalWithdrawal = {
	kind: 'withdrawal'
	timestamp: number
	transactionHash: Hex.Hex
	recipient: Address.Address
	token: Address.Address
	amount: string
	processedInBatch: ZonePortalBatchReference | null
}

export type ZonePortalBatch = {
	kind: 'batch'
	timestamp: number
	transactionHash: Hex.Hex
	batchIndex: string
	withdrawalQueueIndex: string | null
	lastProcessedDepositNumber: string
}

export type ZonePortalActivity =
	| ZonePortalDeposit
	| ZonePortalWithdrawal
	| ZonePortalBatch

export type ZonePortalActivityResponse = {
	items: ZonePortalActivity[]
	total: number
	page: number
	limit: number
}

export function isZonePortalAddress(address: Address.Address): boolean {
	return getZonePortalId(address) !== undefined
}

export function getZonePortalId(address: Address.Address): bigint | undefined {
	const normalized = address.toLowerCase()
	if (!normalized.startsWith(zonePortalPrefix)) return

	const zoneId = BigInt(`0x${normalized.slice(zonePortalPrefix.length)}`)
	if (zoneId === 0n || zoneId > maxZoneId) return
	return zoneId
}

export function withdrawalQueueHashFromInput(input: Hex.Hex): Hex.Hex | null {
	try {
		const decoded = decodeFunctionData({
			abi: processWithdrawalsAbi,
			data: input,
		})
		if (decoded.functionName !== 'processWithdrawals') return null

		const [withdrawals, remainingQueue] = decoded.args
		return withdrawals
			.toReversed()
			.reduce(
				(queueHash, withdrawal) =>
					keccak256(
						encodeAbiParameters(withdrawalQueueHashParameters, [
							withdrawal,
							queueHash,
						]),
					),
				remainingQueue,
			)
	} catch {
		return null
	}
}
