import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { Address, Hex } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import type { AddressTransaction } from '../../_types'
import {
	badRequest,
	corsPreflightResponse,
	DEFAULT_LIMIT,
	MAX_LIMIT,
	paginatedResponse,
	serverError,
} from '../../_utils'
import { hasIndexSupply } from '#lib/env'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

const QuerySchema = z.object({
	offset: z.prefault(z.coerce.number(), 0),
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
	sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
	filter: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
})

export const Route = createFileRoute('/v1/addresses/transactions/$address')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async ({ params, request }) => {
				try {
					const parseResult = zAddress().safeParse(params.address)
					if (!parseResult.success) {
						return badRequest('Invalid address format')
					}
					const address = parseResult.data
					Address.assert(address)

					const url = new URL(request.url)
					const queryResult = QuerySchema.safeParse(
						Object.fromEntries(url.searchParams),
					)
					if (!queryResult.success) {
						return badRequest('Invalid query parameters', queryResult.error)
					}

					const query = queryResult.data
					const limit = Math.min(Math.max(query.limit, 1), MAX_LIMIT)
					const offset = Math.max(query.offset, 0)

					if (!hasIndexSupply()) {
						return paginatedResponse<AddressTransaction[]>([], {
							total: 0,
							offset: 0,
							limit,
							hasMore: false,
						})
					}

					const config = getWagmiConfig()
					const chainId = getChainId(config)

					const includeSent =
						query.filter === 'all' || query.filter === 'sent'
					const includeReceived =
						query.filter === 'all' || query.filter === 'received'
					const sortDirection = query.sort

					const fetchSize = limit + 1
					const bufferSize = Math.min(
						Math.max(offset + fetchSize * 5, limit * 3),
						500,
					)

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

					const [directResult, transferResult] = await Promise.all([
						directTxsQuery.limit(bufferSize).execute(),
						transferHashesQuery.limit(bufferSize).execute(),
					])

					type HashEntry = { hash: Hex.Hex; block_num: bigint }
					const allHashes = new Map<Hex.Hex, HashEntry>()
					for (const row of directResult) {
						allHashes.set(row.hash, {
							hash: row.hash,
							block_num: row.block_num,
						})
					}
					for (const row of transferResult) {
						if (!allHashes.has(row.tx_hash)) {
							allHashes.set(row.tx_hash, {
								hash: row.tx_hash,
								block_num: row.block_num,
							})
						}
					}

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

					let transactions: AddressTransaction[] = []
					if (finalHashes.length > 0) {
						const txDataResult = await QB.selectFrom('txs')
							.select([
								'hash',
								'block_num',
								'from',
								'to',
								'value',
								'gas',
								'gas_price',
								'block_timestamp',
							])
							.where('chain', '=', chainId)
							.where(
								'hash',
								'in',
								finalHashes.map((h) => h.hash),
							)
							.execute()

						const txByHash = new Map(txDataResult.map((tx) => [tx.hash, tx]))
						transactions = finalHashes
							.map((h) => txByHash.get(h.hash))
							.filter((tx): tx is NonNullable<typeof tx> => tx != null)
							.map((row) => {
								const from = Address.checksum(row.from)
								const to = row.to ? Address.checksum(row.to) : null
								return {
									hash: row.hash,
									blockNumber: String(row.block_num),
									from,
									to,
									value: String(row.value),
									gasUsed: String(row.gas),
									gasPrice: String(row.gas_price),
									timestamp: row.block_timestamp
										? Number(row.block_timestamp)
										: undefined,
								}
							})
					}

					const nextOffset = offset + transactions.length

					return paginatedResponse(transactions, {
						total: hasMore ? nextOffset + 1 : nextOffset,
						offset: nextOffset,
						limit,
						hasMore,
					})
				} catch (error) {
					console.error('Address transactions error:', error)
					return serverError('Failed to fetch address transactions')
				}
			},
		},
	},
})
