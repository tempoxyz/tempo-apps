import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import type * as Hex from 'ox/Hex'
import { formatUnits } from 'viem'
import { getBlock, getTransaction, getTransactionReceipt } from 'viem/actions'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { getRequestURL, hasIndexSupply } from '#lib/env'
import {
	fetchAddressDirectTxHistoryRows,
	fetchAddressTransferHashes,
	fetchAddressTransferEmittedHashes,
	fetchBasicTxDataByHashes,
	type SortDirection,
} from '#lib/server/tempo-queries'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const CSV_MAX_LIMIT = 5000

const RequestParametersSchema = z.object({
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
	after: z.optional(z.coerce.number()),
	status: z.optional(z.enum(['success', 'reverted'])),
})

export const Route = createFileRoute('/api/address/csv/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!hasIndexSupply())
					return new Response('CSV export not available', { status: 503 })

				try {
					const url = getRequestURL()
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const parseParams = RequestParametersSchema.safeParse(
						Object.fromEntries(url.searchParams),
					)
					if (!parseParams.success)
						return new Response(
							`Bad request: ${z.prettifyError(parseParams.error)}`,
							{ status: 400 },
						)

					const searchParams = parseParams.data
					const config = getWagmiConfig()
					const client = config.getClient()
					const chainId = getChainId(config)

					const include =
						searchParams.include === 'sent'
							? 'sent'
							: searchParams.include === 'received'
								? 'received'
								: 'all'
					const includeSent = include === 'all' || include === 'sent'
					const includeReceived = include === 'all' || include === 'received'
					const sortDirection: SortDirection = 'desc'

					const queryParams = {
						address,
						chainId,
						includeSent,
						includeReceived,
						sortDirection,
						limit: CSV_MAX_LIMIT,
					}

					type TransferRow = { tx_hash: Hex.Hex; block_num: bigint }

					const emptyTransfer: TransferRow[] = []

					const [directResult, transferResult, transferEmittedResult] =
						await Promise.all([
							fetchAddressDirectTxHistoryRows(queryParams),
							fetchAddressTransferHashes(queryParams),
							fetchAddressTransferEmittedHashes({
								address,
								chainId,
								sortDirection,
								limit: CSV_MAX_LIMIT,
							}).catch(() => emptyTransfer),
						])

					type HashEntry = {
						hash: Hex.Hex
						block_num: bigint
						from?: string
						to?: string | null
						value?: bigint
					}
					const allHashes = new Map<Hex.Hex, HashEntry>()

					for (const row of directResult)
						allHashes.set(row.hash, {
							hash: row.hash,
							block_num: row.block_num,
							from: row.from,
							to: row.to,
							value: row.value,
						})
					for (const row of transferResult)
						if (!allHashes.has(row.tx_hash))
							allHashes.set(row.tx_hash, {
								hash: row.tx_hash,
								block_num: row.block_num,
							})
					for (const row of transferEmittedResult)
						if (!allHashes.has(row.tx_hash))
							allHashes.set(row.tx_hash, {
								hash: row.tx_hash,
								block_num: row.block_num,
							})

					const sortedHashes = [...allHashes.values()].sort(
						(a, b) => Number(b.block_num) - Number(a.block_num),
					)

					const limitedHashes = sortedHashes.slice(0, CSV_MAX_LIMIT)

					if (limitedHashes.length === 0) {
						return new Response(
							'"Transaction Hash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","ContractAddress","Value_IN(ETH)","Value_OUT(ETH)","TxnFee(ETH)","Status","Method"\n',
							{
								headers: {
									'Content-Type': 'text/csv',
									'Content-Disposition': `attachment; filename="transactions-${address}.csv"`,
								},
							},
						)
					}

					const BATCH_SIZE = 50
					const receipts: Awaited<ReturnType<typeof getTransactionReceipt>>[] =
						[]
					const txs: Awaited<ReturnType<typeof getTransaction>>[] = []

					for (let i = 0; i < limitedHashes.length; i += BATCH_SIZE) {
						const batch = limitedHashes.slice(i, i + BATCH_SIZE)
						const [batchReceipts, batchTxs] = await Promise.all([
							Promise.all(
								batch.map((h) =>
									getTransactionReceipt(client, { hash: h.hash }),
								),
							),
							Promise.all(
								batch.map((h) => getTransaction(client, { hash: h.hash })),
							),
						])
						receipts.push(...batchReceipts)
						txs.push(...batchTxs)
					}

					const blockHashes = new Set<`0x${string}`>()
					for (const receipt of receipts) {
						if (receipt.blockHash) blockHashes.add(receipt.blockHash)
					}
					const blockEntries = await Promise.all(
						[...blockHashes].map((blockHash) =>
							getBlock(client, { blockHash }).then(
								(block) => [blockHash, block] as const,
							),
						),
					)
					const blockMap = new Map(blockEntries)

					const missingTxData = limitedHashes.filter((h) => !h.from)
					let txDataMap = new Map<
						string,
						{ from: string; to: string | null; value: bigint }
					>()
					if (missingTxData.length > 0) {
						const txDataResult = await fetchBasicTxDataByHashes(
							chainId,
							missingTxData.map((h) => h.hash),
						)
						txDataMap = new Map(
							txDataResult.map((tx) => [tx.hash, tx] as const),
						)
					}

					const csvHeader =
						'"Transaction Hash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","ContractAddress","Value_IN(ETH)","Value_OUT(ETH)","TxnFee(ETH)","Status","Method"\n'
					const csvRows: string[] = []

					const afterTimestamp = searchParams.after
					const lowerAddress = address.toLowerCase()

					for (let i = 0; i < limitedHashes.length; i++) {
						const hashEntry = limitedHashes[i]
						const receipt = receipts[i]
						const tx = txs[i]
						const block = blockMap.get(receipt.blockHash)
						const timestamp = block ? Number(block.timestamp) : 0

						if (afterTimestamp && timestamp < afterTimestamp) continue
						if (searchParams.status && receipt.status !== searchParams.status)
							continue

						let from: string
						let to: string
						let value: bigint

						if (hashEntry.from) {
							from = Address.checksum(hashEntry.from as Address.Address)
							to = hashEntry.to
								? Address.checksum(hashEntry.to as Address.Address)
								: ''
							value = hashEntry.value ?? 0n
						} else {
							const txData = txDataMap.get(hashEntry.hash)
							if (txData) {
								from = Address.checksum(txData.from as Address.Address)
								to = txData.to
									? Address.checksum(txData.to as Address.Address)
									: ''
								value = txData.value
							} else {
								from = receipt.from
								to = receipt.to ?? ''
								value = 0n
							}
						}

						const dateStr = timestamp
							? new Date(timestamp * 1000)
									.toISOString()
									.replace('T', ' ')
									.replace('Z', '')
							: ''
						const blockNumber = Number(receipt.blockNumber)
						const gasUsed = receipt.gasUsed
						const gasPrice = receipt.effectiveGasPrice
						const fee = gasUsed * gasPrice
						const contractAddress = receipt.contractAddress ?? ''

						const isIncoming =
							to.toLowerCase() === lowerAddress &&
							from.toLowerCase() !== lowerAddress
						const valueEth = formatUnits(value, 18)
						const valueIn = isIncoming ? valueEth : '0'
						const valueOut = isIncoming ? '0' : valueEth
						const feeEth = formatUnits(fee, 18)

						const input = tx?.input ?? '0x'
						const method = input.length >= 10 ? input.slice(0, 10) : ''

						csvRows.push(
							`"${receipt.transactionHash}","${blockNumber}","${timestamp}","${dateStr}","${from}","${to}","${contractAddress}","${valueIn}","${valueOut}","${feeEth}","${receipt.status}","${method}"`,
						)
					}

					return new Response(csvHeader + csvRows.join('\n'), {
						headers: {
							'Content-Type': 'text/csv',
							'Content-Disposition': `attachment; filename="transactions-${address}.csv"`,
						},
					})
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error)
					console.error('CSV export error:', errorMessage)
					return new Response(`Export failed: ${errorMessage}`, {
						status: 500,
					})
				}
			},
		},
	},
})
