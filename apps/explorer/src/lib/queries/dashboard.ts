import { queryOptions } from '@tanstack/react-query'
import type { Block } from 'viem'
import { getBlock } from 'wagmi/actions'
import { getWagmiConfig } from '#wagmi.config.ts'

export const DASHBOARD_BLOCKS_COUNT = 5
export const DASHBOARD_TRANSACTIONS_COUNT = 5

export type NetworkStats = {
	totalTransactions: number
	transactions24h: number
	totalAccounts: number
	accounts24h: number
}

export function networkStatsQueryOptions() {
	return queryOptions({
		queryKey: ['network-stats'],
		queryFn: async (): Promise<NetworkStats> => {
			const response = await fetch(`${__BASE_URL__}/api/stats`)
			const json = (await response.json()) as {
				data: NetworkStats | null
				error: string | null
			}
			if (json.error || !json.data) {
				return {
					totalTransactions: 0,
					transactions24h: 0,
					totalAccounts: 0,
					accounts24h: 0,
				}
			}
			return json.data
		},
		staleTime: 30_000,
		refetchInterval: 60_000,
	})
}

export type DashboardBlock = Pick<
	Block,
	'number' | 'hash' | 'timestamp' | 'transactions'
>

export type DashboardTransaction = {
	hash: `0x${string}`
	from: `0x${string}`
	to: `0x${string}` | null
	blockNumber: bigint
	timestamp: bigint
}

export function dashboardQueryOptions() {
	return queryOptions({
		queryKey: ['dashboard'],
		queryFn: async () => {
			const config = getWagmiConfig()
			const latestBlock = await getBlock(config, { includeTransactions: true })
			const latestBlockNumber = latestBlock.number

			const blockNumbers: bigint[] = []
			for (let i = 0n; i < BigInt(DASHBOARD_BLOCKS_COUNT); i++) {
				const blockNum = latestBlockNumber - i
				if (blockNum >= 0n) blockNumbers.push(blockNum)
			}

			const blocks = await Promise.all(
				blockNumbers.map((blockNumber) =>
					getBlock(config, { blockNumber, includeTransactions: true }).catch(
						() => null,
					),
				),
			)

			const validBlocks = blocks.filter(Boolean) as Block<bigint, true>[]

			const recentBlocks: DashboardBlock[] = validBlocks.map((block) => ({
				number: block.number,
				hash: block.hash,
				timestamp: block.timestamp,
				transactions: block.transactions.map((tx) =>
					typeof tx === 'string' ? tx : tx.hash,
				),
			}))

			const allTransactions: DashboardTransaction[] = []
			for (const block of validBlocks) {
				if (block.number === null) continue
				for (const tx of block.transactions) {
					if (typeof tx === 'string') continue
					allTransactions.push({
						hash: tx.hash,
						from: tx.from,
						to: tx.to,
						blockNumber: block.number,
						timestamp: block.timestamp,
					})
					if (allTransactions.length >= DASHBOARD_TRANSACTIONS_COUNT) break
				}
				if (allTransactions.length >= DASHBOARD_TRANSACTIONS_COUNT) break
			}

			return {
				latestBlockNumber,
				blocks: recentBlocks,
				transactions: allTransactions,
			}
		},
		staleTime: 5_000,
		refetchInterval: 10_000,
	})
}

export type DashboardData = {
	latestBlockNumber: bigint
	blocks: DashboardBlock[]
	transactions: DashboardTransaction[]
}
