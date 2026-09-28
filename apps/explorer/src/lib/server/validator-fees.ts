import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { pad, toEventSelector, zeroAddress } from 'viem'
import { Addresses } from 'viem/tempo'
import { getChainId } from 'wagmi/actions'
import { Abis } from '#lib/abis'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'
import { zAddress } from '#lib/zod'
import { getBatchedClient, getWagmiConfig } from '#wagmi.config'

export type ValidatorFees = {
	blockNumber: string
	fees: {
		token: Address.Address
		amount: string
		symbol: string | null
	}[]
}

const TOKEN_PAGE_SIZE = 100
const MAX_TOKENS = 1_000
const preferenceEvent = toEventSelector('ValidatorTokenSet(address,address)')

/** Read one consistent snapshot, including tokens with no payout events yet. */
export async function getValidatorFees(
	recipient: Address.Address,
): Promise<ValidatorFees> {
	const chainId = getChainId(getWagmiConfig())
	const db = tempoQueryBuilder(chainId, { engine: 'clickhouse' })
	const latest = await db
		.selectFrom('blocks')
		.select('num')
		.orderBy('num', 'desc')
		.limit(1)
		.executeTakeFirst()
	if (!latest) throw new Error('Fee history is unavailable')
	const blockNumber = BigInt(latest.num)
	const client = getBatchedClient()
	const preferred = await client.readContract({
		address: Addresses.feeManager,
		abi: Abis.feeManager,
		functionName: 'validatorTokens',
		args: [recipient],
		blockNumber,
	})
	// The protocol default is pathUSD on every chain, not the explorer's
	// chain-specific default token used when constructing user transactions.
	const tokens = new Set<Address.Address>([Addresses.pathUsd])
	if (preferred !== zeroAddress)
		tokens.add(preferred.toLowerCase() as Address.Address)
	let cursor: `0x${string}` | undefined
	while (true) {
		let query = db
			.selectFrom('logs')
			.select('topic2')
			.distinct()
			.where(
				'address',
				'=',
				Addresses.feeManager.toLowerCase() as Address.Address,
			)
			.where('selector', '=', preferenceEvent)
			.where('topic1', '=', pad(recipient.toLowerCase() as Address.Address))
			.where('block_num', '<=', blockNumber)
			.orderBy('topic2', 'asc')
			.limit(TOKEN_PAGE_SIZE)
		if (cursor) query = query.where('topic2', '>', cursor)
		const rows = await query.execute()
		if (rows.length === 0) break
		for (const row of rows) {
			if (!row.topic2 || !/^0x0{24}20c[0-9a-f]{37}$/i.test(row.topic2))
				throw new Error('Invalid fee token in preference history')
			tokens.add(`0x${row.topic2.slice(-40)}`.toLowerCase() as Address.Address)
		}
		const next = rows.at(-1)?.topic2
		if (!next || (cursor && next <= cursor))
			throw new Error('Incomplete fee token history')
		cursor = next
		if (tokens.size > MAX_TOKENS) throw new Error('Too many fee tokens to load')
	}

	const fees: ValidatorFees['fees'] = []
	const candidates = [...tokens].sort()
	// Bound RPC batches without dropping old or unlisted fee tokens.
	for (let offset = 0; offset < candidates.length; offset += 25) {
		const balances = await Promise.all(
			candidates.slice(offset, offset + 25).map(async (token) => {
				const amount = await client.readContract({
					address: Addresses.feeManager,
					abi: Abis.feeManager,
					functionName: 'collectedFees',
					args: [recipient, token],
					blockNumber,
				})
				if (amount === 0n) return null
				const symbol = await client
					.readContract({
						address: token,
						abi: Abis.tip20,
						functionName: 'symbol',
						blockNumber,
					})
					.catch(() => null)
				return { token, amount: amount.toString(), symbol }
			}),
		)
		for (const balance of balances) if (balance) fees.push(balance)
	}
	return { blockNumber: blockNumber.toString(), fees }
}

export const fetchValidatorFees = createServerFn({ method: 'GET' })
	.inputValidator((input) => zAddress({ lowercase: true }).parse(input))
	.handler(async ({ data }): Promise<ValidatorFees> => {
		let timeout: ReturnType<typeof setTimeout> | undefined
		try {
			return await Promise.race([
				getValidatorFees(data),
				new Promise<never>((_, reject) => {
					timeout = setTimeout(
						() => reject(new Error('Fee lookup timed out')),
						15_000,
					)
				}),
			])
		} catch (error) {
			console.error('Failed to fetch unclaimed validator fees:', error)
			throw new Error(
				'Unclaimed fees are temporarily unavailable. Please try again.',
			)
		} finally {
			clearTimeout(timeout)
		}
	})
