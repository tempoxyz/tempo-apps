import type { Address } from 'ox'
import { runQuery, toBigInt } from './index-supply'

const FEE_MANAGER_CONTRACT = '0xfeec000000000000000000000000000000000000'
const TRANSFER_SIGNATURE =
	'Transfer(address indexed from, address indexed to, uint256 amount)'

function epochToTimestamp(epoch: number): string {
	const date = new Date(epoch * 1000)
	return date.toISOString().replace('T', ' ').substring(0, 19)
}

/**
 * Fetch fee payer usage statistics from IndexSupply
 * @param feePayerAddress Address of the fee payer account
 * @param blockTimestampFrom Optional start timestamp (inclusive)
 * @param blockTimestampTo Optional end timestamp (inclusive)
 * @returns Usage statistics including fees paid, transaction count, and time range
 */
export async function getUsage(
	feePayerAddress: Address.Address,
	blockTimestampFrom?: number,
	blockTimestampTo?: number,
) {
	const whereConditions = [
		`"from" = '${feePayerAddress}'`,
		`"to" = '${FEE_MANAGER_CONTRACT}'`,
	]

	if (blockTimestampFrom !== undefined) {
		whereConditions.push(
			`block_timestamp::timestamp >= '${epochToTimestamp(blockTimestampFrom)}'`,
		)
	}

	if (blockTimestampTo !== undefined) {
		whereConditions.push(
			`block_timestamp::timestamp <= '${epochToTimestamp(blockTimestampTo)}'`,
		)
	}

	const whereClause = whereConditions.join('\n\t\t\t\tand ')

	const query = `
		select
			sum(amount) as total_spent,
			max(block_timestamp) as ending_at,
			min(block_timestamp) as starting_at,
			count(tx_hash) as n_transactions
		from
			transfer
		where
			${whereClause}
		`

	const result = await runQuery(query, { signatures: [TRANSFER_SIGNATURE] })
	const feesPaid = toBigInt(result.rows[0]?.[0])
	return {
		feePayerAddress,
		feesPaid: feesPaid.toString(),
		numTransactions: result.rows[0]?.[3],
		endingAt: result.rows[0]?.[1],
		startingAt: result.rows[0]?.[2],
	}
}
