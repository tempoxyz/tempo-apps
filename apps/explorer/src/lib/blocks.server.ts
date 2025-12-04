import { createServerFn } from '@tanstack/react-start'
import type { Hex } from 'ox'
import * as z from 'zod/mini'
import * as IS from '#lib/index-supply'

const { chainId } = IS
const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]

export type BlockSummary = {
	number: bigint
	hash: Hex.Hex
	timestamp: bigint
	gasUsed: bigint
	gasLimit: bigint
	txCount: number
}

export const fetchBlocksPage = createServerFn()
	.inputValidator(
		z.object({
			page: z.number(),
			limit: z.number(),
		}),
	)
	.handler(async ({ data }) => {
		const page = Math.max(
			1,
			Number.isFinite(data.page) ? Math.floor(data.page) : 1,
		)

		let limit = Number.isFinite(data.limit)
			? Math.floor(data.limit)
			: DEFAULT_LIMIT
		if (limit > MAX_LIMIT) throw new Error('Limit is too high')
		if (limit < 1) limit = 1

		const offset = (page - 1) * limit

		const query = /* sql */ `
			SELECT b.num, b.hash, b.timestamp, b.gas_used, b.gas_limit,
				(SELECT COUNT(t.hash) FROM txs t WHERE t.block_num = b.num AND t.chain = ${chainId}) as tx_count,
				(SELECT MAX(b2.num) FROM blocks b2 WHERE b2.chain = ${chainId}) as latest_block
			FROM blocks b
			WHERE b.chain = ${chainId}
			ORDER BY b.num DESC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		const result = await IS.runIndexSupplyQuery(query)

		const columns = new Map(result.columns.map((col, idx) => [col.name, idx]))
		const getColumn = (row: IS.RowValue[], name: string) => {
			const idx = columns.get(name)
			if (idx === undefined)
				throw new Error(`Missing "${name}" column in IndexSupply response`)
			return row[idx] ?? null
		}

		const latestBlockNumber = IS.toBigInt(
			getColumn(result.rows[0] ?? [], 'latest_block'),
		)

		const blocks: BlockSummary[] = result.rows.map((row) => ({
			number: IS.toBigInt(getColumn(row, 'num')),
			hash: IS.toHexData(getColumn(row, 'hash')),
			timestamp: IS.toTimestamp(String(getColumn(row, 'timestamp'))),
			gasUsed: IS.toBigInt(getColumn(row, 'gas_used')),
			gasLimit: IS.toBigInt(getColumn(row, 'gas_limit')),
			txCount: Number(IS.toBigInt(getColumn(row, 'tx_count'))),
		}))

		return { blocks, latestBlockNumber }
	})
