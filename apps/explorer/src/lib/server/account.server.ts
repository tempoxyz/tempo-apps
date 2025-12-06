import { createServerFn } from '@tanstack/react-start'
import * as IDX from 'idxs'
import { Address, Hex } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { formatUnits, type RpcTransaction } from 'viem'
import { readContract } from 'wagmi/actions'
import * as z from 'zod/mini'
import { zAddress } from '#lib/zod'
import { config, getConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

function toQuantityHex(value: unknown, fallback: bigint = 0n): Hex.Hex {
	if (value === null || value === undefined) return Hex.fromNumber(fallback)
	return Hex.fromNumber(BigInt(value as string | number))
}

function toHexData(value: unknown): Hex.Hex {
	if (typeof value !== 'string' || value.length === 0) return '0x'
	Hex.assert(value)
	return value
}

function toAddressValue(value: unknown): Address.Address | null {
	if (typeof value !== 'string' || value.length === 0) return null
	Address.assert(value)
	return value
}

export const fetchTransactions = createServerFn()
	.inputValidator(
		z.object({
			address: zAddress(),
			offset: z.prefault(z.coerce.number(), 0),
			limit: z.prefault(z.coerce.number(), 100),
			include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
			sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
		}),
	)
	.handler(async ({ data: params }) => {
		const chainId = config.getClient().chain.id
		const chainIdHex = Hex.fromNumber(chainId)

		const include =
			params.include === 'sent'
				? 'sent'
				: params.include === 'received'
					? 'received'
					: 'all'
		const sortDirection = params.sort === 'asc' ? 'asc' : 'desc'

		const offset = Math.max(
			0,
			Number.isFinite(params.offset) ? Math.floor(params.offset) : 0,
		)

		let limit = Number.isFinite(params.limit)
			? Math.floor(params.limit)
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
				eb.or([eb('from', '=', params.address), eb('to', '=', params.address)]),
			)
		} else if (includeSent) {
			directTxsQuery = directTxsQuery.where('from', '=', params.address)
		} else if (includeReceived) {
			directTxsQuery = directTxsQuery.where('to', '=', params.address)
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
				eb.or([eb('from', '=', params.address), eb('to', '=', params.address)]),
			)
		} else if (includeSent) {
			transferHashesQuery = transferHashesQuery.where(
				'from',
				'=',
				params.address,
			)
		} else if (includeReceived) {
			transferHashesQuery = transferHashesQuery.where('to', '=', params.address)
		}

		transferHashesQuery = transferHashesQuery
			.orderBy('block_num', sortDirection)
			.orderBy('tx_hash', sortDirection)
			.limit(fetchSize)

		const [directTxsResult, transferHashesResult] = await Promise.all([
			directTxsQuery.execute(),
			transferHashesQuery.execute(),
		])

		type TxRow = {
			hash: string
			block_num: number
			from: string
			to: string | null
			value: string
			input: string
			nonce: string
			gas: string
			gas_price: string
			type: number
		}

		const txsByHash = new Map<string, TxRow>()
		for (const row of directTxsResult) {
			txsByHash.set(String(row.hash), {
				hash: String(row.hash),
				block_num: Number(row.block_num),
				from: String(row.from),
				to: row.to ? String(row.to) : null,
				value: String(row.value),
				input: String(row.input),
				nonce: String(row.nonce),
				gas: String(row.gas),
				gas_price: String(row.gas_price),
				type: Number(row.type),
			})
		}

		const transferHashes: string[] = []
		for (const row of transferHashesResult) {
			const hash = String(row.tx_hash)
			if (!txsByHash.has(hash)) {
				transferHashes.push(hash)
			}
		}

		if (transferHashes.length > 0) {
			const BATCH_SIZE = 500
			for (let index = 0; index < transferHashes.length; index += BATCH_SIZE) {
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

				for (const row of transferTxsResult) {
					txsByHash.set(String(row.hash), {
						hash: String(row.hash),
						block_num: Number(row.block_num),
						from: String(row.from),
						to: row.to ? String(row.to) : null,
						value: String(row.value),
						input: String(row.input),
						nonce: String(row.nonce),
						gas: String(row.gas),
						gas_price: String(row.gas_price),
						type: Number(row.type),
					})
				}
			}
		}

		const sortedTxs = [...txsByHash.values()].sort((a, b) =>
			sortDirection === 'desc'
				? b.block_num - a.block_num
				: a.block_num - b.block_num,
		)

		const hasMore = sortedTxs.length > offset + limit
		const paginatedTxs = sortedTxs.slice(offset, offset + limit)

		const transactions: RpcTransaction[] = paginatedTxs.map((row) => {
			const hash = toHexData(row.hash)
			const from = toAddressValue(row.from)
			if (!from) throw new Error('Transaction is missing a "from" address')

			const to = toAddressValue(row.to)

			return {
				blockHash: null,
				blockNumber: toQuantityHex(row.block_num),
				chainId: chainIdHex,
				from,
				gas: toQuantityHex(row.gas),
				gasPrice: toQuantityHex(row.gas_price),
				hash,
				input: toHexData(row.input),
				nonce: toQuantityHex(row.nonce),
				to,
				transactionIndex: null,
				value: toQuantityHex(row.value),
				type: toQuantityHex(row.type) as RpcTransaction['type'],
				v: '0x0',
				r: '0x0',
				s: '0x0',
			} as RpcTransaction
		})

		const nextOffset = offset + transactions.length

		return {
			transactions,
			total: hasMore ? nextOffset + 1 : nextOffset,
			offset: nextOffset,
			limit: transactions.length,
			hasMore,
			error: null,
		}
	})

export const getTotalValue = createServerFn()
	.inputValidator(
		z.object({
			address: zAddress(),
		}),
	)
	.handler(async ({ data: params }) => {
		const { address } = params
		const chainId = config.getClient().chain.id

		const result = await QB.withSignatures([TRANSFER_SIGNATURE])
			.selectFrom('transfer')
			.select(['address', 'from', 'to', 'tokens'])
			.where('chain', '=', chainId)
			.where((eb) => eb.or([eb('from', '=', address), eb('to', '=', address)]))
			.execute()

		// Calculate balance per token
		const balances = new Map<string, bigint>()
		for (const row of result) {
			const tokenAddress = String(row.address)
			const from = String(row.from).toLowerCase()
			const to = String(row.to).toLowerCase()
			const tokens = BigInt(row.tokens)
			const addressLower = address.toLowerCase()

			const currentBalance = balances.get(tokenAddress) ?? 0n
			let newBalance = currentBalance
			if (to === addressLower) {
				newBalance += tokens
			}
			if (from === addressLower) {
				newBalance -= tokens
			}
			balances.set(tokenAddress, newBalance)
		}

		// Filter for positive balances
		const rowsWithBalance = [...balances.entries()]
			.filter(([_, balance]) => balance > 0n)
			.map(([token_address, balance]) => ({ token_address, balance }))

		const decimals =
			(await Promise.all(
				rowsWithBalance.map((row) =>
					// TODO: use readContracts when multicall is not broken
					readContract(getConfig(), {
						address: row.token_address as Address.Address,
						abi: Abis.tip20,
						functionName: 'decimals',
					}),
				),
			)) ?? []

		const decimalsMap = new Map<Address.Address, number>(
			decimals.map((decimal, index) => [
				rowsWithBalance[index].token_address as Address.Address,
				decimal,
			]),
		)

		const PRICE_PER_TOKEN = 1 // TODO: fetch actual price per token

		const totalValue = rowsWithBalance
			.map((row) => {
				const tokenDecimals =
					decimalsMap.get(row.token_address as Address.Address) ?? 0
				return Number(formatUnits(row.balance, tokenDecimals))
			})
			.reduce((acc, balance) => acc + balance * PRICE_PER_TOKEN, 0)

		return totalValue
	})

export const FetchAddressTransactionsCountSchema = z.object({
	address: zAddress({ lowercase: true }),
	chainId: z.coerce.number(),
})

export const fetchAddressTransactionsCount = createServerFn({ method: 'GET' })
	.inputValidator((input) => FetchAddressTransactionsCountSchema.parse(input))
	.handler(async ({ data: { address, chainId } }) => {
		const [txSentResult, txReceivedResult] = await Promise.all([
			QB.selectFrom('txs')
				.select((eb) => eb.fn.count('hash').as('cnt'))
				.where('from', '=', address)
				.where('chain', '=', chainId)
				.executeTakeFirstOrThrow(),
			QB.selectFrom('txs')
				.select((eb) => eb.fn.count('hash').as('cnt'))
				.where('to', '=', address)
				.where('chain', '=', chainId)
				.executeTakeFirstOrThrow(),
		])

		const txSent = BigInt(txSentResult.cnt ?? 0)
		const txReceived = BigInt(txReceivedResult.cnt ?? 0)

		return txSent + txReceived
	})
