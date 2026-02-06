import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import type { RpcTransaction } from 'viem'
import { getBlockNumber, getCode, getTransactionReceipt } from 'viem/actions'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { getRequestURL, hasIndexSupply } from '#lib/env'
import {
	fetchAddressDirectTxHashes,
	fetchAddressTransferEmittedHashes,
	fetchAddressTransferHashes,
	fetchContractCreationTxCandidates,
	fetchTxDataByHashes,
	type SortDirection,
} from '#lib/server/tempo-queries'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]

/**
 * Binary search to find the block where a contract was created.
 * Uses historical eth_getCode queries to find when code first appeared.
 */
async function findCreationBlock(
	client: ReturnType<ReturnType<typeof getWagmiConfig>['getClient']>,
	address: Address.Address,
	latestBlock: bigint,
): Promise<bigint | null> {
	let low = 0n
	let high = latestBlock
	let result: bigint | null = null

	// Binary search: find the first block where code exists
	while (low <= high) {
		const mid = (low + high) / 2n
		try {
			// ast-grep-ignore: no-await-in-loop
			const code = await getCode(client, { address, blockNumber: mid })
			if (code && code !== '0x') {
				result = mid
				high = mid - 1n // Look for earlier blocks
			} else {
				low = mid + 1n // Code doesn't exist yet, look later
			}
		} catch {
			// If historical query fails, narrow the search
			low = mid + 1n
		}
	}

	return result
}

/**
 * Finds the contract creation transaction for a given address.
 * Works for direct deployments (to=0x0). Factory-deployed contracts are handled
 * via transfer/event queries in the main handler.
 *
 * Strategy:
 * 1. Check if address has code (is a contract)
 * 2. Binary search to find the exact creation block using historical eth_getCode
 * 3. Query IndexSupply for creation txs at that specific block
 */
async function findContractCreationTx(
	address: Address.Address,
	chainId: number,
): Promise<{ hash: Hex.Hex; block_num: bigint } | null> {
	const config = getWagmiConfig()
	const client = config.getClient()

	// Check if this address has code (is a contract)
	const code = await getCode(client, { address })
	if (!code || code === '0x') return null

	// Get current block number for binary search
	const latestBlock = await getBlockNumber(client)

	// Binary search to find the creation block
	const creationBlock = await findCreationBlock(client, address, latestBlock)
	if (!creationBlock) return null

	// Query IndexSupply for contract creation txs at the creation block
	const creationTxs = await fetchContractCreationTxCandidates(
		chainId,
		creationBlock,
	)

	if (creationTxs.length === 0) return null

	// Check receipts to find the one that created our contract
	const receipts = await Promise.all(
		creationTxs.map(async (tx) => {
			try {
				const receipt = await getTransactionReceipt(client, { hash: tx.hash })
				return { tx, receipt }
			} catch {
				return { tx, receipt: null }
			}
		}),
	)

	const match = receipts.find(
		({ receipt }) =>
			receipt?.contractAddress &&
			Address.isEqual(receipt.contractAddress, address),
	)

	if (match) {
		return { hash: match.tx.hash, block_num: match.tx.block_num }
	}

	return null
}

export const RequestParametersSchema = z.object({
	offset: z.prefault(z.coerce.number(), 0),
	limit: z.prefault(z.coerce.number(), 10),
	sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
})

export const Route = createFileRoute('/api/address/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!hasIndexSupply())
					return Response.json({
						limit: 0,
						total: 0,
						offset: 0,
						hasMore: false,
						transactions: [],
						error: null,
					})

				try {
					const url = getRequestURL()
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const parseParams = RequestParametersSchema.safeParse(
						Object.fromEntries(url.searchParams),
					)
					if (!parseParams.success)
						return Response.json(
							{ error: z.prettifyError(parseParams.error) },
							{ status: 400 },
						)

					const searchParams = parseParams.data
					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const chainIdHex = Hex.fromNumber(chainId)

					const include =
						searchParams.include === 'sent'
							? 'sent'
							: searchParams.include === 'received'
								? 'received'
								: 'all'
					const sortDirection = (
						searchParams.sort === 'asc' ? 'asc' : 'desc'
					) as SortDirection

					const offset = Math.max(
						0,
						Number.isFinite(searchParams.offset)
							? Math.floor(searchParams.offset)
							: 0,
					)

					let limit = Number.isFinite(searchParams.limit)
						? Math.floor(searchParams.limit)
						: DEFAULT_LIMIT

					if (limit > MAX_LIMIT) throw new Error('Limit is too high')

					if (limit < 1) limit = 1

					const includeSent = include === 'all' || include === 'sent'
					const includeReceived = include === 'all' || include === 'received'

					const fetchSize = limit + 1

					// bound fetch size to avoid huge offsets on deep pagination
					const bufferSize = Math.min(
						Math.max(offset + fetchSize * 5, limit * 3),
						500,
					)

					const queryParams = {
						address,
						chainId,
						includeSent,
						includeReceived,
						sortDirection,
						limit: bufferSize,
					}

					// Run queries in parallel: direct txs, transfers (from/to), transfers (emitted), and contract creation
					const [
						directResult,
						transferResult,
						transferEmittedResult,
						creationTx,
					] = await Promise.all([
						fetchAddressDirectTxHashes(queryParams),
						fetchAddressTransferHashes(queryParams),
						fetchAddressTransferEmittedHashes({
							address,
							chainId,
							sortDirection,
							limit: bufferSize,
						}).catch(() => []),
						// Find contract creation tx (returns null for EOAs or on error)
						findContractCreationTx(address, chainId).catch(() => null),
					])

					// Merge all results by block_num, deduplicate, and take top offset+fetchSize
					type HashEntry = { hash: Hex.Hex; block_num: bigint }
					const allHashes = new Map<Hex.Hex, HashEntry>()

					// Add contract creation tx if found
					if (creationTx) {
						allHashes.set(creationTx.hash, {
							hash: creationTx.hash,
							block_num: creationTx.block_num,
						})
					}

					for (const row of directResult)
						allHashes.set(row.hash, {
							hash: row.hash,
							block_num: row.block_num,
						})
					for (const row of transferResult)
						if (!allHashes.has(row.tx_hash))
							allHashes.set(row.tx_hash, {
								hash: row.tx_hash,
								block_num: row.block_num,
							})
					// Add transfers emitted by this contract (for token contracts)
					for (const row of transferEmittedResult)
						if (!allHashes.has(row.tx_hash))
							allHashes.set(row.tx_hash, {
								hash: row.tx_hash,
								block_num: row.block_num,
							})

					const sortedHashes = [...allHashes.values()].sort((a, b) => {
						const blockDiff =
							sortDirection === 'desc'
								? Number(b.block_num) - Number(a.block_num)
								: Number(a.block_num) - Number(b.block_num)
						if (blockDiff !== 0) return blockDiff
						return sortDirection === 'desc'
							? b.hash.localeCompare(a.hash)
							: a.hash.localeCompare(b.hash)
					})

					const paginatedHashes = sortedHashes.slice(offset, offset + fetchSize)
					const hasMore = paginatedHashes.length > limit
					const finalHashes = hasMore
						? paginatedHashes.slice(0, limit)
						: paginatedHashes

					// Fetch full tx data only for the final set of hashes
					let transactions: RpcTransaction[] = []
					if (finalHashes.length > 0) {
						const txDataResult = await fetchTxDataByHashes(
							chainId,
							finalHashes.map((h) => h.hash),
						)

						// Re-sort to match original order
						const txByHash = new Map(txDataResult.map((tx) => [tx.hash, tx]))
						transactions = finalHashes
							.map((h) => txByHash.get(h.hash))
							.filter((tx): tx is NonNullable<typeof tx> => tx != null)
							.map((row) => {
								const from = Address.checksum(row.from)
								if (!from)
									throw new Error('Transaction is missing a "from" address')
								const to = row.to ? Address.checksum(row.to) : null
								return {
									blockHash: null,
									blockNumber: Hex.fromNumber(row.block_num),
									chainId: chainIdHex,
									from,
									gas: Hex.fromNumber(row.gas),
									gasPrice: Hex.fromNumber(row.gas_price),
									hash: row.hash,
									input: row.input,
									nonce: Hex.fromNumber(row.nonce),
									to,
									transactionIndex: null,
									value: Hex.fromNumber(row.value),
									type: Hex.fromNumber(row.type) as RpcTransaction['type'],
									v: '0x0',
									r: '0x0',
									s: '0x0',
								} as RpcTransaction
							})
					}

					const nextOffset = offset + transactions.length

					return Response.json({
						transactions,
						total: hasMore ? nextOffset + 1 : nextOffset,
						offset: nextOffset,
						limit,
						hasMore,
						error: null,
					})
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : error
					console.error(errorMessage)
					return Response.json(
						{ data: null, error: errorMessage },
						{ status: 500 },
					)
				}
			},
		},
	},
})
