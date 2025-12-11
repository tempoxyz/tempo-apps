import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import * as IDX from 'idxs'
import { Address, Hex } from 'ox'
import type { RpcTransaction } from 'viem'
import * as z from 'zod/mini'

import { zAddress } from '#lib/zod.ts'
import { config } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

export const RequestParametersSchema = z.object({
	offset: z.prefault(z.coerce.number(), 0),
	limit: z.prefault(z.coerce.number(), 100),
	sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
})

export const Route = createFileRoute('/api/address/$address')({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				// fallback base needed for dev SSR where request.url may be relative
				const url = new URL(request.url, __BASE_URL__ || 'http://localhost')
				const address = zAddress().parse(params.address)
				Address.assert(address)

				const parseParams = RequestParametersSchema.safeParse(
					Object.fromEntries(url.searchParams),
				)
				if (!parseParams.success)
					return json(
						{ error: z.prettifyError(parseParams.error) },
						{ status: 400 },
					)

				const searchParams = parseParams.data
				const chainId = config.getClient().chain.id
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

				const fetchSize = offset + limit + 1

				// Build direct transactions query
				let directTxsQuery = QB.selectFrom('txs')
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
					.limit(fetchSize)

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
					transferHashesQuery = transferHashesQuery.where('from', '=', address)
				} else if (includeReceived) {
					transferHashesQuery = transferHashesQuery.where('to', '=', address)
				}

				transferHashesQuery = transferHashesQuery
					.orderBy('block_num', sortDirection)
					.orderBy('tx_hash', sortDirection)
					.limit(fetchSize)

				const [directTxsResult, transferHashesResult] = await Promise.all([
					directTxsQuery.execute(),
					transferHashesQuery.execute(),
				])

				const txsByHash = new Map<Hex.Hex, (typeof directTxsResult)[number]>()
				for (const row of directTxsResult) txsByHash.set(row.hash, row)

				const transferHashes: Hex.Hex[] = []
				for (const row of transferHashesResult) {
					const hash = row.tx_hash
					if (!txsByHash.has(hash)) transferHashes.push(hash)
				}

				if (transferHashes.length > 0) {
					const BATCH_SIZE = 500
					for (
						let index = 0;
						index < transferHashes.length;
						index += BATCH_SIZE
					) {
						const batch = transferHashes.slice(index, index + BATCH_SIZE)

						const transferTxsResult = await QB.selectFrom('txs')
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
							.where('hash', 'in', batch)
							.execute()

						for (const row of transferTxsResult) txsByHash.set(row.hash, row)
					}
				}

				const sortedTxs = [...txsByHash.values()].sort((a, b) => {
					const blockDiff =
						sortDirection === 'desc'
							? Number(b.block_num) - Number(a.block_num)
							: Number(a.block_num) - Number(b.block_num)
					// Use hash as tiebreaker for stable sorting
					if (blockDiff !== 0) return blockDiff
					return sortDirection === 'desc'
						? b.hash.localeCompare(a.hash)
						: a.hash.localeCompare(b.hash)
				})

				const hasMore = sortedTxs.length > offset + limit
				const paginatedTxs = sortedTxs.slice(offset, offset + limit)

				const transactions: RpcTransaction[] = paginatedTxs.map((row) => {
					const from = Address.checksum(row.from)
					if (!from) throw new Error('Transaction is missing a "from" address')

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

				const nextOffset = offset + transactions.length

				return json({
					transactions,
					total: hasMore ? nextOffset + 1 : nextOffset,
					offset: nextOffset,
					limit: transactions.length,
					hasMore,
					error: null,
				})
			},
		},
	},
})
