import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { Address, Hex } from 'ox'
import type { RpcTransaction } from 'viem'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { getRequestURL, isTestnet } from '#lib/env'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

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
				if (isTestnet())
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
					const sortDirection = searchParams.sort === 'asc' ? 'asc' : 'desc'

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

					// Build direct transactions query - only fetch hashes first for efficiency
					let directTxsQuery = QB.selectFrom('txs')
						.select(['hash', 'block_num'])
						.where('chain', '=', chainId)

					if (includeSent && includeReceived) {
						directTxsQuery = directTxsQuery.where((eb) =>
							eb.or([eb('from', '=', address), eb('to', '=', address)]),
						)
					} else if (includeSent) {
						directTxsQuery = directTxsQuery.where('from', '=', address)
					} else if (includeReceived) {
						directTxsQuery = directTxsQuery.where('to', '=', address)
					}

					directTxsQuery = directTxsQuery
						.orderBy('block_num', sortDirection)
						.orderBy('hash', sortDirection)

					// Build transfer hashes query
					let transferHashesQuery = QB.withSignatures([TRANSFER_SIGNATURE])
						.selectFrom('transfer')
						.select(['tx_hash', 'block_num'])
						.distinct()
						.where('chain', '=', chainId)

					if (includeSent && includeReceived) {
						transferHashesQuery = transferHashesQuery.where((eb) =>
							eb.or([eb('from', '=', address), eb('to', '=', address)]),
						)
					} else if (includeSent) {
						transferHashesQuery = transferHashesQuery.where(
							'from',
							'=',
							address,
						)
					} else if (includeReceived) {
						transferHashesQuery = transferHashesQuery.where('to', '=', address)
					}

					transferHashesQuery = transferHashesQuery
						.orderBy('block_num', sortDirection)
						.orderBy('tx_hash', sortDirection)

					// bound fetch size to avoid huge offsets on deep pagination
					const bufferSize = Math.min(
						Math.max(offset + fetchSize * 5, limit * 3),
						500,
					)

					// Run both queries in parallel and merge-sort to get top N hashes
					const [directResult, transferResult] = await Promise.all([
						directTxsQuery.limit(bufferSize).execute(),
						transferHashesQuery.limit(bufferSize).execute(),
					])

					// Merge both results by block_num, deduplicate, and take top offset+fetchSize
					type HashEntry = { hash: Hex.Hex; block_num: bigint }
					const allHashes = new Map<Hex.Hex, HashEntry>()
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
						const txDataResult = await QB.selectFrom('txs')
							.select([
								'hash',
								'block_num',
								'from',
								'to',
								'value',
								'input',
								'nonce',
								'gas',
								'gas_price',
								'type',
							])
							.where('chain', '=', chainId)
							.where(
								'hash',
								'in',
								finalHashes.map((h) => h.hash),
							)
							.execute()

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
