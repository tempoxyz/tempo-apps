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

		const addressFilterParts: string[] = []
		if (directConditions.length)
			addressFilterParts.push(`(${directConditions.join(' OR ')})`)

		if (transferConditions.length) {
			addressFilterParts.push(`
						t.hash IN (
							SELECT DISTINCT tr.tx_hash
							FROM transfer tr
							WHERE tr.chain = ${chainId}
								AND (${transferConditions.join(' OR ')})
						)
					`)
		}

		if (addressFilterParts.length === 0) addressFilterParts.push('FALSE')

		const addressFilter = addressFilterParts.join(' OR ')

		// Parallelize count and transactions fetch
		const [countResult, txsResult] = await Promise.all([
			IS.runIndexSupplyQuery(
				/* sql */ `
								SELECT count(t.hash) as total
								FROM txs t
								WHERE t.chain = ${chainId}
									AND (${addressFilter})
							`,
				{ signatures: [transferSignature] },
			),
			IS.runIndexSupplyQuery(
				/* sql */ `
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
								WHERE t.chain = ${chainId}
									AND (${addressFilter})
								ORDER BY t.block_num ${sortDirection}, t.hash ${sortDirection}
								LIMIT ${limit}
								OFFSET ${offset}
							`,
				{ signatures: [transferSignature] },
			),
		])

		const totalValue = countResult.rows.at(0)?.at(0)
		const total =
			typeof totalValue === 'number'
				? totalValue
				: typeof totalValue === 'string'
					? Number(totalValue)
					: 0

		const txColumns = new Map(
			txsResult.columns.map((column, index) => [column.name, index]),
		)
		const getColumnValue = (row: IS.RowValue[], name: string) => {
			const columnIndex = txColumns.get(name)
			if (columnIndex === undefined)
				throw new Error(`Missing "${name}" column in IndexSupply response`)
			return row[columnIndex] ?? null
		}

		const transactions: RpcTransaction[] = txsResult.rows.map((row) => {
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
		const hasMore = nextOffset < total

		return {
			transactions,
			total,
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

		const searchParams = new URLSearchParams({
			query: `SELECT address as token_address, SUM(CASE WHEN "to" = '${address}' THEN tokens ELSE 0 END) - SUM(CASE WHEN "from" = '${address}' THEN tokens ELSE 0 END) as balance FROM transfer WHERE chain = ${chainId} AND ("to" = '${address}' OR "from" = '${address}') GROUP BY address`,
			signatures:
				'Transfer(address indexed from, address indexed to, uint tokens)',
			'api-key': env.INDEXSUPPLY_API_KEY || '',
		})

		const response = await fetch(`${IS.endpoint}?${searchParams}`)

		if (!response.ok)
			throw new Error(
				`Failed to fetch total value: ${response.status} ${await response.text()}`,
			)

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
