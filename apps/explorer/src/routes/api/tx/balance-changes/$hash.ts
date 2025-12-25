import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'ox'
import type { Log } from 'viem'
import { getAbiItem, parseEventLogs, zeroAddress } from 'viem'
import { getTransactionReceipt, readContract } from 'viem/actions'
import { Abis } from 'viem/tempo'
import * as z from 'zod/mini'

import { zHash } from '#lib/zod'
import { config } from '#wagmi.config'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const RPC_CONCURRENCY = 5

async function mapWithConcurrency<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	concurrency: number,
): Promise<R[]> {
	const results: R[] = []
	let index = 0

	async function worker() {
		while (index < items.length) {
			const currentIndex = index++
			results[currentIndex] = await fn(items[currentIndex])
		}
	}

	await Promise.all(Array.from({ length: concurrency }, () => worker()))
	return results
}

export interface TokenBalanceChange {
	address: Address.Address
	token: Address.Address
	balanceBefore: string
	balanceAfter: string
	diff: string
}

export interface TokenMetadata {
	decimals: number
	symbol: string
}

export interface BalanceChangesData {
	changes: TokenBalanceChange[]
	tokenMetadata: Record<Address.Address, TokenMetadata>
	total: number
}

const transferAbi = [getAbiItem({ abi: Abis.tip20, name: 'Transfer' })]

function computeBalanceChanges(logs: Log[]) {
	const events = parseEventLogs({
		abi: transferAbi,
		logs,
		strict: false,
	})

	const changes = new Map<
		string,
		{
			address: Address.Address
			token: Address.Address
			diff: bigint
		}
	>()

	const addChange = (
		address: Address.Address,
		token: Address.Address,
		amount: bigint,
	) => {
		if (address === zeroAddress) return
		const key = `${address}:${token}`
		const change = changes.get(key)
		if (change) change.diff += amount
		else changes.set(key, { address, token, diff: amount })
	}

	for (const event of events) {
		if (event.eventName !== 'Transfer') continue
		const { from, to, amount } = event.args
		if (!amount) continue
		if (from) addChange(from, event.address, -amount)
		if (to) addChange(to, event.address, amount)
	}

	return Array.from(changes.values()).filter(({ diff }) => diff !== 0n)
}

async function getBalanceAtBlock(
	client: ReturnType<typeof config.getClient>,
	token: Address.Address,
	account: Address.Address,
	blockNumber: bigint,
): Promise<bigint | null> {
	try {
		return await readContract(client, {
			address: token,
			abi: Abis.tip20,
			functionName: 'balanceOf',
			args: [account],
			blockNumber,
		})
	} catch {
		return null
	}
}

async function getTokenMetadata(
	client: ReturnType<typeof config.getClient>,
	token: Address.Address,
) {
	const [decimals, symbol] = await Promise.all([
		readContract(client, {
			address: token,
			abi: Abis.tip20,
			functionName: 'decimals',
		}).catch(() => null),
		readContract(client, {
			address: token,
			abi: Abis.tip20,
			functionName: 'symbol',
		}).catch(() => null),
	])
	if (decimals === null || symbol === null) return null
	return { decimals, symbol }
}

export async function fetchBalanceChanges(params: {
	hash: Address.Address
	limit: number
	offset: number
}): Promise<BalanceChangesData> {
	const { hash, limit, offset } = params
	const client = config.getClient()

	const receipt = await getTransactionReceipt(client, { hash })

	const balanceChanges = computeBalanceChanges(receipt.logs)

	if (balanceChanges.length === 0) {
		return { changes: [], tokenMetadata: {}, total: 0 }
	}

	const uniqueTokens = [...new Set(balanceChanges.map(({ token }) => token))]

	const tokenMetadataEntries = await mapWithConcurrency(
		uniqueTokens,
		async (token) => [token, await getTokenMetadata(client, token)] as const,
		RPC_CONCURRENCY,
	)

	const balanceAfterResults = await mapWithConcurrency(
		balanceChanges,
		async (change) => ({
			...change,
			balanceAfter: await getBalanceAtBlock(
				client,
				change.token,
				change.address,
				receipt.blockNumber,
			),
		}),
		RPC_CONCURRENCY,
	)

	const tokenMetadata = Object.fromEntries(
		tokenMetadataEntries.filter(
			(entry): entry is [Address.Address, TokenMetadata] => entry[1] !== null,
		),
	)

	const allChanges = balanceAfterResults
		.filter(
			(change): change is typeof change & { balanceAfter: bigint } =>
				change.balanceAfter !== null && Boolean(tokenMetadata[change.token]),
		)
		.map((change) => ({
			address: change.address,
			token: change.token,
			balanceBefore: String(change.balanceAfter - change.diff),
			balanceAfter: String(change.balanceAfter),
			diff: String(change.diff),
		}))

	return {
		changes: allChanges.slice(offset, offset + limit),
		tokenMetadata,
		total: allChanges.length,
	}
}

const querySchema = z.object({
	limit: z.optional(z.coerce.number()),
	offset: z.optional(z.coerce.number()),
})

export const Route = createFileRoute('/api/tx/balance-changes/$hash')({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				try {
					const hash = zHash().parse(params.hash)
					const url = new URL(request.url)
					const query = querySchema.parse({
						limit: url.searchParams.get('limit') ?? undefined,
						offset: url.searchParams.get('offset') ?? undefined,
					})
					const limit = Math.min(MAX_LIMIT, query.limit ?? DEFAULT_LIMIT)
					const offset = query.offset ?? 0

					const data = await fetchBalanceChanges({ hash, limit, offset })
					return Response.json(data)
				} catch (error) {
					console.error('Balance changes error:', error)
					return Response.json(
						{ error: 'Failed to fetch balance changes' },
						{ status: 500 },
					)
				}
			},
		},
	},
})
