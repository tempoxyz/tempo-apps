import type { Address, Hex } from 'ox'
import * as AddressUtils from 'ox/Address'
import * as HexUtils from 'ox/Hex'
import type { Config } from 'wagmi'
import type { Log, TransactionReceipt } from 'viem'
import { decodeFunctionData, parseEventLogs } from 'viem'
import { Abis } from 'viem/tempo'
import { Actions } from 'wagmi/tempo'
import { type KnownEvent, parseKnownEvents } from '#lib/domain/known-events'
import { isTip20Address, type Metadata } from '#lib/domain/tip20'
import type {
	AddressHistoryLogRow,
	AddressHistoryReceiptRow,
	AddressHistoryTxDetailsRow,
} from '#lib/server/tempo-queries'
import { getWagmiConfig } from '#wagmi.config'

const abi = Object.values(Abis).flat()

function serializeBigInts<T>(value: T): T {
	if (typeof value === 'bigint') {
		return value.toString() as T
	}
	if (Array.isArray(value)) {
		return value.map(serializeBigInts) as T
	}
	if (value !== null && typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value)) {
			result[k] = serializeBigInts(v)
		}
		return result as T
	}
	return value
}

function toHistoryStatus(
	status: number | null | undefined,
): 'success' | 'reverted' {
	return status === 0 ? 'reverted' : 'success'
}

function toFiniteTimestamp(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'string') {
		const parsed = Number(value)
		if (Number.isFinite(parsed)) return parsed
		const parsedDate = Date.parse(value)
		if (Number.isFinite(parsedDate)) return Math.floor(parsedDate / 1000)
	}
	return 0
}

function toHexQuantity(value: unknown): Hex.Hex {
	if (typeof value === 'bigint' || typeof value === 'number') {
		try {
			return HexUtils.fromNumber(value)
		} catch {
			return '0x0'
		}
	}
	if (typeof value === 'string') {
		try {
			return HexUtils.fromNumber(BigInt(value))
		} catch {
			return '0x0'
		}
	}
	return '0x0'
}

export type EnrichedTransaction = {
	hash: `0x${string}`
	blockNumber: string
	timestamp: number
	from: `0x${string}`
	to: `0x${string}` | null
	value: string
	status: 'success' | 'reverted'
	gasUsed: string
	effectiveGasPrice: string
	knownEvents: KnownEvent[]
}

export type HistoryHashEntry = {
	hash: Hex.Hex
	block_num: bigint
	from?: string
	to?: string | null
	value?: bigint
}

export async function buildTxOnlyTransactions(params: {
	address: Address.Address
	hashes: HistoryHashEntry[]
	txRows: AddressHistoryTxDetailsRow[]
	receiptRows: AddressHistoryReceiptRow[]
	logRows: AddressHistoryLogRow[]
}): Promise<EnrichedTransaction[]> {
	const receiptMap = new Map(
		params.receiptRows.map((row) => [row.tx_hash, row] as const),
	)
	const txMap = new Map(params.txRows.map((row) => [row.hash, row] as const))
	const logsByHash = new Map<Hex.Hex, Log[]>()

	for (const row of params.logRows) {
		const topics = [row.topic0, row.topic1, row.topic2, row.topic3].filter(
			(topic): topic is Hex.Hex => Boolean(topic),
		)

		const log = {
			address: row.address,
			data: row.data,
			topics,
			blockNumber: row.block_num,
			logIndex: row.log_idx,
			transactionHash: row.tx_hash,
			transactionIndex: row.tx_idx,
			removed: false,
		} as unknown as Log

		const txLogs = logsByHash.get(row.tx_hash)
		if (txLogs) {
			txLogs.push(log)
		} else {
			logsByHash.set(row.tx_hash, [log])
		}
	}

	const allLogs: Log[] = []
	for (const txLogs of logsByHash.values()) {
		allLogs.push(...txLogs)
	}

	const events = (() => {
		try {
			return parseEventLogs({ abi, logs: allLogs })
		} catch (error) {
			console.error('[history] failed to parse logs for metadata:', error)
			return []
		}
	})()
	const tokenAddresses = new Set<Address.Address>()
	if (isTip20Address(params.address)) tokenAddresses.add(params.address)
	for (const event of events) {
		if (isTip20Address(event.address)) {
			tokenAddresses.add(event.address)
		}
	}

	const config = getWagmiConfig()
	const tokenMetadataEntries = await Promise.all(
		[...tokenAddresses].map(async (token) => {
			try {
				const metadata = await Actions.token.getMetadata(config as Config, {
					token,
				})
				return [token.toLowerCase(), metadata] as const
			} catch {
				return [token.toLowerCase(), undefined] as const
			}
		}),
	)
	const tokenMetadataMap = new Map<string, Metadata | undefined>(
		tokenMetadataEntries,
	)

	const getTokenMetadata = (addr: Address.Address) =>
		tokenMetadataMap.get(addr.toLowerCase())

	function decodeTip20CallEvent(
		tx: AddressHistoryTxDetailsRow | undefined,
		sender: Address.Address,
	): KnownEvent | null {
		if (!tx?.to || !tx.input || tx.input === '0x') return null
		if (!isTip20Address(tx.to)) return null

		const createAmount = (value: bigint) => {
			const metadata = getTokenMetadata(tx.to as Address.Address)
			return {
				token: tx.to as Address.Address,
				value,
				decimals: metadata?.decimals,
				symbol: metadata?.symbol,
			}
		}

		try {
			const decoded = decodeFunctionData({ abi: Abis.tip20, data: tx.input })

			switch (decoded.functionName) {
				case 'mint':
				case 'mintWithMemo': {
					const [to, amount] = decoded.args as [Address.Address, bigint]
					const isMintToRecipient = !AddressUtils.isEqual(sender, to)

					return {
						type: 'mint',
						parts: [
							{
								type: 'action',
								value: isMintToRecipient ? 'Mint to Recipient' : 'Mint',
							},
							{ type: 'amount', value: createAmount(amount) },
							{ type: 'text', value: 'to' },
							{ type: 'account', value: to },
						],
						meta: { from: sender, to },
					}
				}
				case 'burn':
				case 'burnWithMemo': {
					const [amount] = decoded.args as [bigint]

					return {
						type: 'burn',
						parts: [
							{ type: 'action', value: 'Burn' },
							{ type: 'amount', value: createAmount(amount) },
							{ type: 'text', value: 'from' },
							{ type: 'account', value: sender },
						],
						meta: { from: sender },
					}
				}
				case 'transfer':
				case 'transferWithMemo': {
					const [to, amount] = decoded.args as [Address.Address, bigint]

					return {
						type: 'send',
						parts: [
							{ type: 'action', value: 'Send' },
							{ type: 'amount', value: createAmount(amount) },
							{ type: 'text', value: 'to' },
							{ type: 'account', value: to },
						],
						meta: { from: sender, to },
					}
				}
				default:
					return null
			}
		} catch {
			return null
		}
	}

	return params.hashes.map((hashEntry) => {
		const receipt = receiptMap.get(hashEntry.hash)
		const tx = txMap.get(hashEntry.hash)
		const txLogs = logsByHash.get(hashEntry.hash) ?? []

		const fromSource =
			tx?.from ?? hashEntry.from ?? receipt?.from ?? params.address
		const toSource = tx?.to ?? hashEntry.to ?? receipt?.to ?? null
		const valueSource = tx?.value ?? hashEntry.value ?? 0n
		const blockNumberSource =
			receipt?.block_num ?? tx?.block_num ?? hashEntry.block_num
		const timestampSource = receipt?.block_timestamp ?? tx?.block_timestamp ?? 0
		const status = toHistoryStatus(receipt?.status)

		const receiptForKnownEvents = {
			from: (receipt?.from ?? fromSource) as Address.Address,
			to: toSource as Address.Address | null,
			status,
			logs: txLogs,
			contractAddress: receipt?.contract_address
				? (receipt.contract_address as Address.Address)
				: null,
		} as unknown as TransactionReceipt

		const transactionForKnownEvents = tx
			? {
					to: tx.to as Address.Address | null,
					input: tx.input,
					data: tx.input,
					calls: Array.isArray(tx.calls) ? (tx.calls as never) : undefined,
				}
			: undefined

		let knownEvents = (() => {
			try {
				return parseKnownEvents(receiptForKnownEvents, {
					transaction: transactionForKnownEvents as never,
					getTokenMetadata,
				})
			} catch (error) {
				console.error(
					`[history] failed to parse known events for ${hashEntry.hash}:`,
					error,
				)
				return []
			}
		})()

		if (
			knownEvents.length === 0 ||
			(knownEvents.length === 1 && knownEvents[0]?.type === 'contract call')
		) {
			const callEvent = decodeTip20CallEvent(tx, fromSource as Address.Address)
			if (callEvent) knownEvents = [callEvent]
		}

		return {
			hash: hashEntry.hash,
			blockNumber: toHexQuantity(blockNumberSource),
			timestamp: toFiniteTimestamp(timestampSource),
			from: AddressUtils.checksum(fromSource as Address.Address),
			to: toSource ? AddressUtils.checksum(toSource as Address.Address) : null,
			value: toHexQuantity(valueSource),
			status,
			gasUsed: toHexQuantity(receipt?.gas_used),
			effectiveGasPrice: toHexQuantity(receipt?.effective_gas_price),
			knownEvents: serializeBigInts(knownEvents),
		}
	})
}
