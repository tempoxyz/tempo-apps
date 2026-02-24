import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Hex } from 'ox'
import type { Log } from 'viem'
import { getTempoEnv } from '#lib/env'
import { getBatchedClient } from '#wagmi.config'

const SIGNET_ORDERS_CONTRACT =
	'0x000000000000007369676e65742d6f7264657273' as const

const ORDERS_API_URLS: Partial<Record<string, string>> = {
	parmigiana: 'https://transactions.parmigiana.signet.sh',
}

export type OpenOrder = {
	id: string
}

export type FilledOrder = {
	transactionHash: Hex.Hex
	blockNumber: bigint
	from: Hex.Hex
	timestamp?: bigint
}

export const ORDERS_PER_PAGE = 20

function getOrdersApiUrl(): string | null {
	const env = getTempoEnv()
	return ORDERS_API_URLS[env] ?? null
}

export function openOrdersQueryOptions() {
	const apiUrl = getOrdersApiUrl()
	return queryOptions({
		queryKey: ['open-orders'],
		queryFn: async (): Promise<OpenOrder[]> => {
			if (!apiUrl) return []
			try {
				const response = await fetch(`${apiUrl}/orders`)
				if (!response.ok) return []
				const data = (await response.json()) as { orders: OpenOrder[] }
				return data.orders
			} catch {
				return []
			}
		},
		refetchInterval: 5_000,
		staleTime: 3_000,
	})
}

export function filledOrdersQueryOptions(page: number = 1) {
	return queryOptions({
		queryKey: ['filled-orders', page],
		queryFn: async (): Promise<{
			orders: FilledOrder[]
			totalBlocks: number
		}> => {
			try {
				const client = getBatchedClient()
				const latestBlock = await client.getBlockNumber()

				const blocksToScan = BigInt(ORDERS_PER_PAGE * 100)
				const toBlock = latestBlock - BigInt((page - 1) * ORDERS_PER_PAGE * 100)
				const fromBlock =
					toBlock > blocksToScan ? toBlock - blocksToScan : 0n

				const logs = await client.getLogs({
					address: SIGNET_ORDERS_CONTRACT,
					fromBlock,
					toBlock,
				})

				const orders: FilledOrder[] = logs
					.reverse()
					.slice(0, ORDERS_PER_PAGE)
					.map((log: Log) => ({
						transactionHash: log.transactionHash as Hex.Hex,
						blockNumber: log.blockNumber as bigint,
						from: '0x' as Hex.Hex,
					}))

				return {
					orders,
					totalBlocks: Number(latestBlock),
				}
			} catch {
				return { orders: [], totalBlocks: 0 }
			}
		},
		placeholderData: keepPreviousData,
		staleTime: 10_000,
	})
}
