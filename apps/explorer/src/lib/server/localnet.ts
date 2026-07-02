import type { Address, Hex } from 'ox'
import {
	type AbiEvent,
	type Block,
	type Log,
	parseAbiItem,
	type Transaction,
	type TransactionReceipt,
	zeroAddress,
} from 'viem'
import { Addresses } from 'viem/tempo'
import * as ABIS from '#lib/abis'
import { getBatchedClient } from '#wagmi.config.ts'

const TRANSFER_EVENT = parseAbiItem(
	'event Transfer(address indexed from, address indexed to, uint256 amount)',
)
const TOKEN_CREATED_EVENT_CACHE = new Map<number, AbiEvent>()

export type LocalnetTokenCreatedRow = {
	address: Address.Address
	name: string
	symbol: string
	currency: string
	createdAt: number | null
}

export type LocalnetTransferRow = {
	token: Address.Address
	from: Address.Address
	to: Address.Address
	value: bigint
	transactionHash: Hex.Hex
	blockNumber: bigint
	logIndex: number
	timestamp: number | null
}

export type LocalnetTokenMetadata = {
	name?: string | undefined
	symbol?: string | undefined
	currency?: string | undefined
	decimals?: number | undefined
}

export type LocalnetHolderRow = {
	address: Address.Address
	balance: bigint
}

export type LocalnetHistoryRecord = {
	blockNumber: bigint
	blockTimestamp: number
	transactionIndex: number
	transaction: Transaction
	receipt: TransactionReceipt
}

export type LocalnetAddressHistoryInput = {
	address: Address.Address
	include: 'all' | 'sent' | 'received'
	status?: 'success' | 'reverted' | undefined
	after?: number | undefined
	scanLimit?: number | undefined
}

const LOCALNET_HISTORY_BLOCK_BATCH_SIZE = 64
const LOCALNET_HISTORY_BLOCK_SCAN_LIMIT = 10_000

function tokenCreatedEvent(chainId: number) {
	const cached = TOKEN_CREATED_EVENT_CACHE.get(chainId)
	if (cached) return cached

	const event = parseAbiItem(ABIS.getTokenCreatedEvent(chainId)) as AbiEvent
	TOKEN_CREATED_EVENT_CACHE.set(chainId, event)
	return event
}

function transferValue(args: {
	amount?: bigint
	tokens?: bigint
}): bigint | null {
	return args.amount ?? args.tokens ?? null
}

function logKey(log: Pick<Log, 'transactionHash' | 'logIndex'>): string {
	return `${log.transactionHash?.toLowerCase() ?? ''}:${String(log.logIndex)}`
}

async function blockTimestamps(
	blockNumbers: Iterable<bigint>,
): Promise<Map<string, number | null>> {
	const client = getBatchedClient()
	const uniqueBlockNumbers = [...new Set([...blockNumbers].map(String))].map(
		BigInt,
	)
	const entries = await Promise.all(
		uniqueBlockNumbers.map(async (blockNumber) => {
			try {
				const block = await client.getBlock({ blockNumber })
				return [blockNumber.toString(), Number(block.timestamp)] as const
			} catch {
				return [blockNumber.toString(), null] as const
			}
		}),
	)
	return new Map(entries)
}

function mapTransferLog(log: Log): LocalnetTransferRow | null {
	const args = (
		log as typeof log & {
			args?: {
				from?: Address.Address
				to?: Address.Address
				amount?: bigint
				tokens?: bigint
			}
		}
	).args
	if (
		!args?.from ||
		!args.to ||
		!log.transactionHash ||
		log.blockNumber == null ||
		log.logIndex == null
	) {
		return null
	}

	const value = transferValue(args)
	if (value == null) return null

	return {
		token: log.address as Address.Address,
		from: args.from,
		to: args.to,
		value,
		transactionHash: log.transactionHash as Hex.Hex,
		blockNumber: log.blockNumber,
		logIndex: Number(log.logIndex),
		timestamp: null,
	}
}

function sortTransfersDesc(
	a: Pick<LocalnetTransferRow, 'blockNumber' | 'logIndex'>,
	b: Pick<LocalnetTransferRow, 'blockNumber' | 'logIndex'>,
): number {
	if (a.blockNumber !== b.blockNumber)
		return a.blockNumber > b.blockNumber ? -1 : 1
	return b.logIndex - a.logIndex
}

async function addTransferTimestamps(
	rows: LocalnetTransferRow[],
): Promise<LocalnetTransferRow[]> {
	const timestamps = await blockTimestamps(rows.map((row) => row.blockNumber))
	return rows.map((row) => ({
		...row,
		timestamp: timestamps.get(row.blockNumber.toString()) ?? null,
	}))
}

export async function fetchLocalnetTokenCreatedRows(
	chainId: number,
): Promise<LocalnetTokenCreatedRow[]> {
	const client = getBatchedClient()
	const logs = await client.getLogs({
		address: Addresses.tip20Factory,
		event: tokenCreatedEvent(chainId),
		fromBlock: 0n,
		toBlock: 'latest',
	})

	const parsedRows = logs.flatMap((log) => {
		const args = (
			log as typeof log & {
				args?: {
					token?: unknown
					name?: unknown
					symbol?: unknown
					currency?: unknown
				}
			}
		).args
		if (
			typeof args?.token !== 'string' ||
			typeof args.name !== 'string' ||
			typeof args.symbol !== 'string' ||
			typeof args.currency !== 'string' ||
			log.blockNumber == null ||
			log.logIndex == null
		) {
			return []
		}

		return [
			{
				address: args.token as Address.Address,
				name: args.name,
				symbol: args.symbol,
				currency: args.currency,
				blockNumber: log.blockNumber,
				logIndex: Number(log.logIndex),
			},
		]
	})

	const timestamps = await blockTimestamps(
		parsedRows.map((row) => row.blockNumber),
	)
	return parsedRows
		.sort((a, b) => {
			if (a.blockNumber !== b.blockNumber) {
				return a.blockNumber > b.blockNumber ? -1 : 1
			}
			return b.logIndex - a.logIndex
		})
		.map((row) => ({
			address: row.address,
			name: row.name,
			symbol: row.symbol,
			currency: row.currency,
			createdAt: timestamps.get(row.blockNumber.toString()) ?? null,
		}))
}

export async function fetchLocalnetTokenMetadata(
	token: Address.Address,
): Promise<LocalnetTokenMetadata> {
	const client = getBatchedClient()
	return client.token
		.getMetadata({ token })
		.then((metadata) => ({
			name: metadata.name,
			symbol: metadata.symbol,
			currency: metadata.currency,
			decimals: metadata.decimals,
		}))
		.catch(() => ({}))
}

export async function fetchLocalnetTokenTransfers(options: {
	token: Address.Address
	account?: Address.Address | undefined
}): Promise<LocalnetTransferRow[]> {
	const client = getBatchedClient()
	const account = options.account?.toLowerCase()
	const logs = await client.getLogs({
		address: options.token,
		event: TRANSFER_EVENT,
		fromBlock: 0n,
		toBlock: 'latest',
	})

	const rows = logs.flatMap((log) => {
		const row = mapTransferLog(log)
		if (!row) return []
		if (
			account &&
			row.from.toLowerCase() !== account &&
			row.to.toLowerCase() !== account
		) {
			return []
		}
		return [row]
	})

	return (await addTransferTimestamps(rows)).sort(sortTransfersDesc)
}

export async function fetchLocalnetAccountTransfers(
	account: Address.Address,
): Promise<LocalnetTransferRow[]> {
	const client = getBatchedClient()
	const [incomingLogs, outgoingLogs] = await Promise.all([
		client.getLogs({
			event: TRANSFER_EVENT,
			args: { to: account },
			fromBlock: 0n,
			toBlock: 'latest',
		}),
		client.getLogs({
			event: TRANSFER_EVENT,
			args: { from: account },
			fromBlock: 0n,
			toBlock: 'latest',
		}),
	])

	const byKey = new Map<string, LocalnetTransferRow>()
	for (const log of [...incomingLogs, ...outgoingLogs]) {
		const row = mapTransferLog(log)
		if (row) byKey.set(logKey(log), row)
	}

	return (await addTransferTimestamps([...byKey.values()])).sort(
		sortTransfersDesc,
	)
}

export function aggregateLocalnetHolders(
	transfers: LocalnetTransferRow[],
): LocalnetHolderRow[] {
	const balances = new Map<
		string,
		{ address: Address.Address; balance: bigint }
	>()

	for (const transfer of transfers) {
		if (transfer.to !== zeroAddress) {
			const key = transfer.to.toLowerCase()
			const existing = balances.get(key) ?? {
				address: transfer.to,
				balance: 0n,
			}
			existing.balance += transfer.value
			balances.set(key, existing)
		}

		if (transfer.from !== zeroAddress) {
			const key = transfer.from.toLowerCase()
			const existing = balances.get(key) ?? {
				address: transfer.from,
				balance: 0n,
			}
			existing.balance -= transfer.value
			balances.set(key, existing)
		}
	}

	return [...balances.values()]
		.filter((holder) => holder.balance > 0n)
		.sort((a, b) =>
			a.balance === b.balance ? 0 : a.balance > b.balance ? -1 : 1,
		)
}

export async function fetchLocalnetAddressBalances(
	account: Address.Address,
): Promise<
	Array<{
		token: Address.Address
		balance: bigint
		metadata: LocalnetTokenMetadata
	}>
> {
	const transfers = await fetchLocalnetAccountTransfers(account)
	const balances = new Map<
		string,
		{ token: Address.Address; balance: bigint }
	>()

	for (const transfer of transfers) {
		const key = transfer.token.toLowerCase()
		const existing = balances.get(key) ?? { token: transfer.token, balance: 0n }
		if (transfer.to.toLowerCase() === account.toLowerCase()) {
			existing.balance += transfer.value
		}
		if (transfer.from.toLowerCase() === account.toLowerCase()) {
			existing.balance -= transfer.value
		}
		balances.set(key, existing)
	}

	const positiveBalances = [...balances.values()].filter(
		(row) => row.balance > 0n,
	)
	const metadataEntries = await Promise.all(
		positiveBalances.map(
			async (row) =>
				[
					row.token.toLowerCase(),
					await fetchLocalnetTokenMetadata(row.token),
				] as const,
		),
	)
	const metadataByToken = new Map(metadataEntries)

	return positiveBalances.map((row) => ({
		...row,
		metadata: metadataByToken.get(row.token.toLowerCase()) ?? {},
	}))
}

function topicToAddress(topic: Hex.Hex | undefined): string | null {
	if (!topic) return null
	return `0x${topic.slice(-40)}`.toLowerCase()
}

function transferLogMatches(
	log: Pick<Log, 'topics'>,
	addressKey: string,
	includeSent: boolean,
	includeReceived: boolean,
): boolean {
	const from = topicToAddress(log.topics[1])
	const to = topicToAddress(log.topics[2])
	return (
		(includeSent && from === addressKey) ||
		(includeReceived && to === addressKey)
	)
}

export async function fetchLocalnetAddressHistoryRecords(
	input: LocalnetAddressHistoryInput,
): Promise<{ records: LocalnetHistoryRecord[]; countCapped: boolean }> {
	const client = getBatchedClient()
	const latestBlock = await client.getBlockNumber()
	const addressKey = input.address.toLowerCase()
	const includeSent = input.include !== 'received'
	const includeReceived = input.include !== 'sent'
	const scanLimit = input.scanLimit ?? LOCALNET_HISTORY_BLOCK_SCAN_LIMIT
	const records: LocalnetHistoryRecord[] = []
	let scannedBlocks = 0
	let scanLimitReached = false

	let batchEnd = latestBlock
	while (batchEnd >= 0n && scannedBlocks < scanLimit) {
		const batchSize = Math.min(
			LOCALNET_HISTORY_BLOCK_BATCH_SIZE,
			scanLimit - scannedBlocks,
		)
		const batchSpan = BigInt(batchSize - 1)
		const batchStart = batchEnd > batchSpan ? batchEnd - batchSpan : 0n
		const blockNumbers: bigint[] = []
		for (
			let blockNumber = batchEnd;
			blockNumber >= batchStart;
			blockNumber -= 1n
		) {
			blockNumbers.push(blockNumber)
			if (blockNumber === 0n) break
		}
		scannedBlocks += blockNumbers.length

		const blocks = await Promise.all(
			blockNumbers.map((blockNumber) =>
				client.getBlock({ blockNumber, includeTransactions: true }),
			),
		)

		let shouldStop = false
		for (const block of blocks as Array<Block<bigint, true>>) {
			if (block.number == null) continue
			const blockTimestamp = Number(block.timestamp)
			if (input.after && blockTimestamp < input.after) {
				shouldStop = true
				break
			}

			for (const transaction of block.transactions) {
				const receipt = await client.getTransactionReceipt({
					hash: transaction.hash,
				})

				if (
					input.status &&
					receipt.status !==
						(input.status === 'reverted' ? 'reverted' : 'success')
				) {
					continue
				}

				const directMatch =
					(includeSent && transaction.from.toLowerCase() === addressKey) ||
					(includeReceived && transaction.to?.toLowerCase() === addressKey) ||
					(includeReceived &&
						receipt.contractAddress?.toLowerCase() === addressKey)
				const transferMatch = receipt.logs.some((log) =>
					transferLogMatches(log, addressKey, includeSent, includeReceived),
				)

				if (!directMatch && !transferMatch) continue

				records.push({
					blockNumber: block.number,
					blockTimestamp,
					transactionIndex: Number(transaction.transactionIndex ?? 0),
					transaction,
					receipt,
				})
			}
		}

		if (shouldStop || batchStart === 0n) break
		batchEnd = batchStart - 1n
	}

	if (batchEnd > 0n && scannedBlocks >= scanLimit) scanLimitReached = true

	return { records, countCapped: scanLimitReached }
}
