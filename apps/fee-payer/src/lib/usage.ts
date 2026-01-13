import { env } from 'cloudflare:workers'
import * as IDX from 'idxs'
import { sql } from 'kysely'
import type { Address } from 'ox'
import { createPublicClient, formatUnits, http } from 'viem'
import { Actions, Addresses } from 'viem/tempo'
import { tempoChain } from './chain.js'

const IS = IDX.IndexSupply.create({
	apiKey: env.INDEXSUPPLY_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

const epochToTimestamp = (epoch: number): string =>
	new Date(epoch * 1000).toISOString()

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
	const query = QB.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select((eb) => [
			eb.fn.sum('tokens').as('total_spent'),
			sql<number>`max(transfer.block_timestamp)`.as('ending_at'),
			sql<number>`min(transfer.block_timestamp)`.as('starting_at'),
			eb.fn.count('tx_hash').as('n_transactions'),
		])
		.where('chain', '=', tempoChain.id)
		.where('from', '=', feePayerAddress)
		.where('to', '=', Addresses.feeManager)
		.$if(blockTimestampFrom !== undefined, (eb) =>
			eb.where(
				sql`transfer.block_timestamp::timestamp`,
				'>=',
				`'${epochToTimestamp(blockTimestampFrom as number)}'`,
			),
		)
		.$if(blockTimestampTo !== undefined, (eb) =>
			eb.where(
				sql`transfer.block_timestamp::timestamp`,
				'<=',
				`'${epochToTimestamp(blockTimestampTo as number)}'`,
			),
		)

	const result = await query.executeTakeFirst()

	const feesPaid = result?.total_spent ? BigInt(result.total_spent) : 0n
	const feeTokenMetadata = await Actions.token.getMetadata(
		createPublicClient({
			chain: tempoChain,
			transport: http(env.TEMPO_RPC_URL ?? tempoChain.rpcUrls.default.http[0]),
		}),
		{ token: tempoChain.feeToken },
	)

	return {
		feePayerAddress,
		feesPaid: formatUnits(feesPaid, feeTokenMetadata.decimals),
		feeCurrency: feeTokenMetadata.currency,
		numTransactions: result?.n_transactions ? Number(result.n_transactions) : 0,
		endingAt: result?.ending_at ?? null,
		startingAt: result?.starting_at ?? null,
	}
}
