import * as Address from 'ox/Address'
import type { Config } from 'wagmi'
import { Actions } from 'wagmi/tempo'
import { zeroHash } from 'viem'
import { Addresses as ZoneAddresses } from 'viem-zones/tempo'
import {
	Abis,
	zoneFactoryRegistryAbi,
	zonePortalActivityAbi,
	zonePortalReadAbi,
} from '#lib/abis'
import {
	isZonePortalAddress,
	type ZonePortalActivityKind,
	type ZonePortalActivityResponse,
	type ZonePortalAsset,
	type ZonePortalBatch,
	type ZonePortalDeposit,
	type ZonePortalOverview,
	type ZonePortalWithdrawal,
	withdrawalQueueHashFromInput,
} from '#lib/domain/zones'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'
import { getBatchedClient, getWagmiConfig } from '#wagmi.config'

function portalQueryBuilder(chainId: number) {
	return tempoQueryBuilder(chainId).withAbi(zonePortalActivityAbi)
}

async function countDeposits(address: Address.Address, chainId: number) {
	const result = await portalQueryBuilder(chainId)
		.selectFrom('depositmade')
		.select((eb) => eb.fn.count('tx_hash').as('count'))
		.where('address', '=', address.toLowerCase() as Address.Address)
		.executeTakeFirst()
	return Number(result?.count ?? 0)
}

async function countWithdrawals(address: Address.Address, chainId: number) {
	const result = await portalQueryBuilder(chainId)
		.selectFrom('withdrawalprocessed')
		.select((eb) => eb.fn.count('tx_hash').as('count'))
		.where('address', '=', address.toLowerCase() as Address.Address)
		.executeTakeFirst()
	return Number(result?.count ?? 0)
}

async function countBatches(address: Address.Address, chainId: number) {
	const result = await portalQueryBuilder(chainId)
		.selectFrom('batchsubmitted')
		.select((eb) => eb.fn.count('tx_hash').as('count'))
		.where('address', '=', address.toLowerCase() as Address.Address)
		.executeTakeFirst()
	return Number(result?.count ?? 0)
}

async function getEnabledAssets(
	address: Address.Address,
	tokenCount: bigint,
): Promise<ZonePortalAsset[]> {
	const client = getBatchedClient()
	const config = getWagmiConfig()
	const tokens = await Promise.all(
		Array.from({ length: Number(tokenCount) }, (_, index) =>
			client.readContract({
				address,
				abi: zonePortalReadAbi,
				functionName: 'enabledTokenAt',
				args: [BigInt(index)],
			}),
		),
	)

	return Promise.all(
		tokens.map(async (token) => {
			const [metadata, balance] = await Promise.all([
				Actions.token.getMetadata(config as Config, { token }),
				client.readContract({
					address: token,
					abi: Abis.tip20,
					functionName: 'balanceOf',
					args: [address],
				}),
			])

			return {
				address: Address.checksum(token),
				balance: balance.toString(),
				decimals: metadata.decimals,
				symbol: metadata.symbol,
			}
		}),
	)
}

export async function fetchZonePortalOverview(params: {
	address: Address.Address
	chainId: number
}): Promise<ZonePortalOverview> {
	const { address, chainId } = params
	if (!isZonePortalAddress(address))
		throw new Error('Address is not a Zone Portal')

	const client = getBatchedClient()
	const registered = await client.readContract({
		address: ZoneAddresses.zoneFactory,
		abi: zoneFactoryRegistryAbi,
		functionName: 'isZonePortal',
		args: [address],
	})
	if (!registered) throw new Error('Address is not a registered Zone Portal')

	const [tokenCount, deposits, withdrawals, batches] = await Promise.all([
		client.readContract({
			address,
			abi: zonePortalReadAbi,
			functionName: 'enabledTokenCount',
		}),
		countDeposits(address, chainId),
		countWithdrawals(address, chainId),
		countBatches(address, chainId),
	])

	return {
		isZonePortal: true,
		assets: await getEnabledAssets(address, tokenCount),
		counts: { deposits, withdrawals, batches },
	}
}

async function fetchDeposits(params: {
	address: Address.Address
	chainId: number
	page: number
	limit: number
}): Promise<ZonePortalActivityResponse> {
	const { address, chainId, page, limit } = params
	const portal = address.toLowerCase() as Address.Address
	const qb = portalQueryBuilder(chainId)
	const [rows, total] = await Promise.all([
		qb
			.selectFrom('depositmade')
			.select([
				'block_timestamp',
				'tx_hash',
				'sender',
				'token',
				'netAmount',
				'depositNumber',
			])
			.where('address', '=', portal)
			.orderBy('block_num', 'desc')
			.orderBy('log_idx', 'desc')
			.limit(limit)
			.offset((page - 1) * limit)
			.execute(),
		countDeposits(address, chainId),
	])

	const items: ZonePortalDeposit[] = await Promise.all(
		rows.map(async (row) => {
			const batch = await portalQueryBuilder(chainId)
				.selectFrom('batchsubmitted')
				.select(['tx_hash', 'withdrawalBatchIndex'])
				.where('address', '=', portal)
				.where('lastProcessedDepositNumber', '>=', row.depositNumber)
				.orderBy('lastProcessedDepositNumber', 'asc')
				.orderBy('withdrawalBatchIndex', 'asc')
				.limit(1)
				.executeTakeFirst()

			return {
				kind: 'deposit',
				timestamp: row.block_timestamp,
				transactionHash: row.tx_hash,
				sender: Address.checksum(row.sender),
				token: Address.checksum(row.token),
				amount: row.netAmount.toString(),
				processedInBatch: batch
					? {
							index: batch.withdrawalBatchIndex.toString(),
							transactionHash: batch.tx_hash,
						}
					: null,
			}
		}),
	)

	return { items, total, page, limit }
}

async function fetchWithdrawals(params: {
	address: Address.Address
	chainId: number
	page: number
	limit: number
}): Promise<ZonePortalActivityResponse> {
	const { address, chainId, page, limit } = params
	const portal = address.toLowerCase() as Address.Address
	const [rows, total] = await Promise.all([
		portalQueryBuilder(chainId)
			.selectFrom('withdrawalprocessed')
			.select(['block_timestamp', 'tx_hash', 'to', 'token', 'amount'])
			.where('address', '=', portal)
			.orderBy('block_num', 'desc')
			.orderBy('log_idx', 'desc')
			.limit(limit)
			.offset((page - 1) * limit)
			.execute(),
		countWithdrawals(address, chainId),
	])

	const client = getBatchedClient()
	const batchesByTransaction = new Map(
		await Promise.all(
			[...new Set(rows.map((row) => row.tx_hash))].map(
				async (transactionHash) => {
					const transaction = await client.getTransaction({
						hash: transactionHash,
					})
					const callData =
						'calls' in transaction && transaction.calls
							? transaction.calls.find(
									(call) => call.to && Address.isEqual(call.to, address),
								)?.data
							: transaction.input
					const queueHash = callData
						? withdrawalQueueHashFromInput(callData)
						: null
					const batch = queueHash
						? await portalQueryBuilder(chainId)
								.selectFrom('batchsubmitted')
								.select(['tx_hash', 'withdrawalBatchIndex'])
								.where('address', '=', portal)
								.where('withdrawalQueueHash', '=', queueHash)
								.limit(1)
								.executeTakeFirst()
						: undefined
					return [transactionHash, batch] as const
				},
			),
		),
	)

	const items: ZonePortalWithdrawal[] = rows.map((row) => {
		const batch = batchesByTransaction.get(row.tx_hash)
		return {
			kind: 'withdrawal',
			timestamp: row.block_timestamp,
			transactionHash: row.tx_hash,
			recipient: Address.checksum(row.to),
			token: Address.checksum(row.token),
			amount: row.amount.toString(),
			processedInBatch: batch
				? {
						index: batch.withdrawalBatchIndex.toString(),
						transactionHash: batch.tx_hash,
					}
				: null,
		}
	})

	return { items, total, page, limit }
}

async function fetchBatches(params: {
	address: Address.Address
	chainId: number
	page: number
	limit: number
}): Promise<ZonePortalActivityResponse> {
	const { address, chainId, page, limit } = params
	const portal = address.toLowerCase() as Address.Address
	const [rows, total] = await Promise.all([
		portalQueryBuilder(chainId)
			.selectFrom('batchsubmitted')
			.select([
				'block_timestamp',
				'tx_hash',
				'withdrawalBatchIndex',
				'withdrawalQueueIndex',
				'withdrawalQueueHash',
				'lastProcessedDepositNumber',
			])
			.where('address', '=', portal)
			.orderBy('block_num', 'desc')
			.orderBy('log_idx', 'desc')
			.limit(limit)
			.offset((page - 1) * limit)
			.execute(),
		countBatches(address, chainId),
	])

	const items: ZonePortalBatch[] = rows.map((row) => {
		return {
			kind: 'batch',
			timestamp: row.block_timestamp,
			transactionHash: row.tx_hash,
			batchIndex: row.withdrawalBatchIndex.toString(),
			withdrawalQueueIndex:
				row.withdrawalQueueHash === zeroHash
					? null
					: row.withdrawalQueueIndex.toString(),
			lastProcessedDepositNumber: row.lastProcessedDepositNumber.toString(),
		}
	})

	return { items, total, page, limit }
}

export async function fetchZonePortalActivity(params: {
	address: Address.Address
	chainId: number
	kind: ZonePortalActivityKind
	page: number
	limit: number
}): Promise<ZonePortalActivityResponse> {
	if (!isZonePortalAddress(params.address)) {
		throw new Error('Address is not a Zone Portal')
	}

	if (params.kind === 'deposits') return fetchDeposits(params)
	if (params.kind === 'withdrawals') return fetchWithdrawals(params)
	return fetchBatches(params)
}
