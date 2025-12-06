import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { formatUnits, type RpcTransaction } from 'viem'
import { getChainId, readContract } from 'wagmi/actions'
import * as z from 'zod/mini'
import * as IS from '#lib/index-supply'
import { zAddress } from '#lib/zod'
import { config, getConfig } from '#wagmi.config.ts'

const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]
const { chainId, chainIdHex } = IS

/** Normalize SQL for cleaner logging (collapse whitespace) */
const normalizeSQL = (sql: string) => sql.replace(/\s+/g, ' ').trim()

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
		const include =
			params.include === 'sent'
				? 'sent'
				: params.include === 'received'
					? 'received'
					: 'all'
		const sortDirection = params.sort === 'asc' ? 'ASC' : 'DESC'

		const offset = Math.max(
			0,
			Number.isFinite(params.offset) ? Math.floor(params.offset) : 0,
		)

		let limit = Number.isFinite(params.limit)
			? Math.floor(params.limit)
			: DEFAULT_LIMIT

		if (limit > MAX_LIMIT) throw new Error('Limit is too high')

		if (limit < 1) limit = 1

		const transferSignature =
			'Transfer(address indexed from, address indexed to, uint tokens)'
		const includeSent = include === 'all' || include === 'sent'
		const includeReceived = include === 'all' || include === 'received'

		const directConditions: string[] = []
		if (includeSent) directConditions.push(`t."from" = '${params.address}'`)
		if (includeReceived) directConditions.push(`t."to" = '${params.address}'`)

		const transferConditions: string[] = []
		if (includeSent) transferConditions.push(`tr."from" = '${params.address}'`)
		if (includeReceived)
			transferConditions.push(`tr."to" = '${params.address}'`)

		const directFilter =
			directConditions.length > 0 ? directConditions.join(' OR ') : 'FALSE'
		const transferFilter =
			transferConditions.length > 0 ? transferConditions.join(' OR ') : 'FALSE'

		const fetchSize = offset + limit + 1

		const directTxsQuery = /* sql */ `
			SELECT
				t.hash,
				t.block_num,
				t."from",
				t."to",
				t.value,
				t.input,
				t.nonce,
				t.gas,
				t.gas_price,
				t.type
			FROM txs t
			WHERE t.chain = ${chainId} AND (${directFilter})
			ORDER BY t.block_num ${sortDirection}, t.hash ${sortDirection}
			LIMIT ${fetchSize}
		`

		const transferTxHashesQuery = /* sql */ `
			SELECT DISTINCT tr.tx_hash as hash, tr.block_num
			FROM transfer tr
			WHERE tr.chain = ${chainId} AND (${transferFilter})
			ORDER BY tr.block_num ${sortDirection}, tr.tx_hash ${sortDirection}
			LIMIT ${fetchSize}
		`

		const [directTxsResult, transferHashesResult] =
			await IS.runIndexSupplyBatch([
				{ query: directTxsQuery },
				{ query: transferTxHashesQuery, signatures: [transferSignature] },
			])

		const directTxColumns = new Map(
			directTxsResult.columns.map((column, index) => [column.name, index]),
		)
		const hashIdx = directTxColumns.get('hash')
		const blockNumIdx = directTxColumns.get('block_num')

		// Handle empty results (no columns returned when no rows match)
		const hasDirectColumns = hashIdx !== undefined && blockNumIdx !== undefined

		type TxRow = {
			hash: string
			block_num: number
			row: IS.RowValue[]
		}

		const txsByHash = new Map<string, TxRow>()
		if (hasDirectColumns) {
			for (const row of directTxsResult.rows) {
				const hash = row[hashIdx]
				const blockNum = row[blockNumIdx]
				if (typeof hash === 'string' && typeof blockNum === 'number') {
					txsByHash.set(hash, { hash, block_num: blockNum, row })
				}
			}
		}

		const transferHashes: string[] = []
		for (const row of transferHashesResult.rows) {
			const hash = row[0]
			if (typeof hash === 'string' && !txsByHash.has(hash)) {
				transferHashes.push(hash)
			}
		}

		if (transferHashes.length > 0) {
			const BATCH_SIZE = 500
			for (let index = 0; index < transferHashes.length; index += BATCH_SIZE) {
				const batch = transferHashes.slice(index, index + BATCH_SIZE)
				const hashList = batch.map((h) => `'${h}'`).join(',')
				const transferTxsQuery = /* sql */ `
					SELECT
						t.hash,
						t.block_num,
						t."from",
						t."to",
						t.value,
						t.input,
						t.nonce,
						t.gas,
						t.gas_price,
						t.type
					FROM txs t
					WHERE t.chain = ${chainId} AND t.hash IN (${hashList})
				`
				const transferTxsResult = await IS.runIndexSupplyQuery(
					transferTxsQuery,
					{ signatures: [''] },
				)
				const transferTxColumns = new Map(
					transferTxsResult.columns.map((column, index) => [
						column.name,
						index,
					]),
				)
				const transferHashIdx = transferTxColumns.get('hash')
				const transferBlockNumIdx = transferTxColumns.get('block_num')
				if (
					transferHashIdx !== undefined &&
					transferBlockNumIdx !== undefined
				) {
					for (const row of transferTxsResult.rows) {
						const hash = row[transferHashIdx]
						const blockNum = row[transferBlockNumIdx]
						if (typeof hash === 'string' && typeof blockNum === 'number') {
							txsByHash.set(hash, { hash, block_num: blockNum, row })
						}
					}
				}
			}
		}

		const sortedTxs = [...txsByHash.values()].sort((a, b) =>
			sortDirection === 'DESC'
				? b.block_num - a.block_num
				: a.block_num - b.block_num,
		)

		const hasMore = sortedTxs.length > offset + limit
		const paginatedTxs = sortedTxs.slice(offset, offset + limit)

		// Expected columns in consistent order (matches our SELECT queries)
		const expectedColumns = [
			{ name: 'hash', pgtype: 'bytea' },
			{ name: 'block_num', pgtype: 'int8' },
			{ name: 'from', pgtype: 'bytea' },
			{ name: 'to', pgtype: 'bytea' },
			{ name: 'value', pgtype: 'numeric' },
			{ name: 'input', pgtype: 'bytea' },
			{ name: 'nonce', pgtype: 'int8' },
			{ name: 'gas', pgtype: 'int8' },
			{ name: 'gas_price', pgtype: 'int8' },
			{ name: 'type', pgtype: 'int2' },
		]
		const txColumns = new Map(
			expectedColumns.map((column, index) => [column.name, index]),
		)
		const getColumnValue = (row: IS.RowValue[], name: string) => {
			const columnIndex = txColumns.get(name)
			if (columnIndex === undefined)
				throw new Error(`Missing "${name}" column in IndexSupply response`)
			return row[columnIndex] ?? null
		}

		const transactions: RpcTransaction[] = paginatedTxs.map(({ row }) => {
			const hash = IS.toHexData(getColumnValue(row, 'hash'))
			const from = IS.toAddressValue(getColumnValue(row, 'from'))
			if (!from) throw new Error('Transaction is missing a "from" address')

			const to = IS.toAddressValue(getColumnValue(row, 'to'))

			return {
				blockHash: null,
				blockNumber: IS.toQuantityHex(getColumnValue(row, 'block_num')),
				chainId: chainIdHex,
				from,
				gas: IS.toQuantityHex(getColumnValue(row, 'gas')),
				gasPrice: IS.toQuantityHex(getColumnValue(row, 'gas_price')),
				hash,
				input: IS.toHexData(getColumnValue(row, 'input')),
				nonce: IS.toQuantityHex(getColumnValue(row, 'nonce')),
				to,
				transactionIndex: null,
				value: IS.toQuantityHex(getColumnValue(row, 'value')),
				type: IS.toQuantityHex(
					getColumnValue(row, 'type'),
				) as RpcTransaction['type'],
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
		const chainId = getChainId(config)

		const query = `SELECT address as token_address, SUM(CASE WHEN "to" = '${address}' THEN tokens ELSE 0 END) - SUM(CASE WHEN "from" = '${address}' THEN tokens ELSE 0 END) as balance FROM transfer WHERE chain = ${chainId} AND ("to" = '${address}' OR "from" = '${address}') GROUP BY address`

		const searchParams = new URLSearchParams({
			query,
			signatures:
				'Transfer(address indexed from, address indexed to, uint tokens)',
			'api-key': env.INDEXSUPPLY_API_KEY || '',
		})

		const response = await fetch(`${IS.endpoint}?${searchParams}`)

		if (!response.ok) {
			const errorText = await response.text()
			console.error('IndexSupply total value query failed:', {
				query: normalizeSQL(query),
				status: response.status,
				error: errorText,
			})
			throw new Error(
				`Failed to fetch total value: ${response.status} ${errorText}`,
			)
		}

		const responseData = await response.json()

		const result = z
			.array(
				z.object({
					cursor: z.string(),
					columns: z.array(
						z.object({
							name: z.string(),
							pgtype: z.enum(['bytea', 'numeric']),
						}),
					),
					rows: z.array(z.tuple([z.string(), z.string()])),
				}),
			)
			.safeParse(responseData)

		if (!result.success) {
			throw new Error(`Invalid response data: ${z.prettifyError(result.error)}`)
		}

		const rowsWithBalance =
			result.data.at(0)?.rows.filter(([_, balance]) => BigInt(balance) > 0n) ??
			[]

		const decimals =
			(await Promise.all(
				rowsWithBalance.map(([address]) =>
					// TODO: use readContracts when multicall is not broken
					readContract(getConfig(), {
						address: address as Address.Address,
						abi: Abis.tip20,
						functionName: 'decimals',
					}),
				),
			)) ?? []

		const decimalsMap = new Map<Address.Address, number>(
			decimals.map((decimal, index) => [
				rowsWithBalance[index][0] as Address.Address,
				decimal,
			]),
		)

		const PRICE_PER_TOKEN = 1 // TODO: fetch actual price per token

		const totalValue = rowsWithBalance
			.map(([address, balance]) => {
				const tokenDecimals = decimalsMap.get(address as Address.Address) ?? 0
				return Number(formatUnits(BigInt(balance), tokenDecimals))
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
		const result = await IS.runIndexSupplyQuery(/* sql */ `
SELECT SUM(CASE WHEN "from" = '${address}' THEN 1 ELSE 0 END) as sent, 
       SUM(CASE WHEN "to" = '${address}' THEN 1 ELSE 0 END) as received 
       FROM txs WHERE ("from" = '${address}' OR "to" = '${address}') AND chain = ${chainId}`)

		const cursor = result.cursor
		if (!cursor?.includes('-')) return 0n

		const [, total] = cursor.split('-')

		return BigInt(total)
	})
