import { useInfiniteQuery } from '@tanstack/react-query'
import { Hex, Json } from 'ox'
import {
	type Address,
	formatTransaction,
	type RpcTransaction,
	type Transaction,
} from 'viem'
import { getBlock, getTransactionCount } from 'viem/actions'
import { useBlock, useClient } from 'wagmi'

export function useInfiniteAccountTransactions({
	address,
	limit = 10,
}: useInfiniteAccountTransactions.Options = {}) {
	const client = useClient()

	return useInfiniteQuery({
		enabled: Boolean(address),
		initialPageParam: 0,
		getNextPageParam: (lastPage: Transaction[]) => {
			if (lastPage.length < limit) return null
			// biome-ignore lint/style/noNonNullAssertion: _
			const nextPageParam = lastPage[lastPage.length - 1].nonce! - 1

			return nextPageParam
		},
		placeholderData: (previousData) => previousData,
		queryKey: [
			'account-transactions',
			client.chain.id,
			{ address, limit },
		] as const,
		async queryFn({ pageParam, queryKey }) {
			const [, , { address, limit }] = queryKey

			if (!address) throw new Error('address is required')

			const nonce =
				pageParam > 0
					? pageParam
					: await getTransactionCount(client, { address })

			const promises: Promise<RpcTransaction>[] = []
			for (let i = nonce; i > nonce - limit; i--) {
				promises.push(
					// biome-ignore lint/suspicious/noExplicitAny: _
					client.request<any>({
						method: 'eth_getTransactionBySenderAndNonce',
						params: [address, Hex.fromNumber(i)],
					}),
				)
			}

			const transactions = await Promise.all(promises)

			return transactions
				.map((t) => {
					if (!t) return undefined
					return formatTransaction(t)
				})
				.filter(Boolean) as Transaction[]
		},
	})
}

export declare namespace useInfiniteAccountTransactions {
	export type Options = {
		address?: Address | undefined
		limit?: number | undefined
	}
}

export function useInfiniteTransactions({
	limit = 10,
	startBlock,
}: useInfiniteTransactions.Options = {}) {
	const { data: block } = useBlock()
	const client = useClient()

	return useInfiniteQuery({
		enabled: Boolean(startBlock ?? block?.number),
		initialPageParam: Hex.fromNumber(startBlock ?? 0n),
		getNextPageParam: (lastPage: Transaction[]) => {
			if (lastPage.length < limit) return null
			const nextPageParam = Hex.fromNumber(
				// biome-ignore lint/style/noNonNullAssertion: _
				lastPage[lastPage.length - 1].blockNumber! - 1n,
			)
			return nextPageParam
		},
		placeholderData: (previousData) => previousData,
		queryKey: [
			'block-transactions',
			client.chain.id,
			Json.stringify({ block, limit }),
		] as const,
		async queryFn({ pageParam, queryKey }) {
			const [, , options] = queryKey
			const { block, limit } = Json.parse(options)

			if (!block) throw new Error('block not found')

			let blockNumber =
				Hex.toBigInt(pageParam) === 0n ? block.number : pageParam

			let count = 0
			let transactions: Transaction[] = []
			while (transactions.length < limit && count < 10 && blockNumber > 0n) {
				const block_ = await getBlock(client, {
					blockNumber,
					includeTransactions: true,
				})
				transactions = [...transactions, ...block_.transactions] as never
				blockNumber--
				count++
			}
			return transactions
		},
	})
}

export declare namespace useInfiniteTransactions {
	export type Options = {
		limit?: number | undefined
		startBlock?: bigint | undefined
	}
}
