import { createFileRoute } from '@tanstack/react-router'
import { Address, Hex } from 'ox'
import type { RpcTransaction } from 'viem'
import { getClient, getTransactionCount } from 'wagmi/actions'
import { z } from 'zod'
import { config } from '#wagmi.config'

// biome-ignore lint/suspicious/noExplicitAny: _
type TODO = any

const [MAX_LIMIT, _DEFAULT_LIMIT] = [1_000, 100]

export const Route = createFileRoute('/api/account/$address')({
	beforeLoad: async ({ search, params }) => {
		const { address } = params
		const { offset, limit } = search

		if (limit > MAX_LIMIT) throw new Error('Limit is too high')

		return { address, offset, limit }
	},
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const { address } = params
				const url = new URL(request.url)
				const offset = Number(url.searchParams.get('offset') ?? 0)
				const limit = Number(url.searchParams.get('limit') ?? 100)

				const client = getClient(config)

				const transactionCount = await getTransactionCount(config, { address })

				// Calculate nonce range for descending order (newest first)
				const startNonce = Math.max(0, transactionCount - offset - limit)
				const endNonce = Math.max(0, transactionCount - offset)
				const actualLimit = endNonce - startNonce

				const promises: Array<Promise<RpcTransaction>> = Array.from(
					{ length: actualLimit },
					async (_, index) =>
						client.request<TODO>({
							method: 'eth_getTransactionBySenderAndNonce',
							params: [address, Hex.fromNumber(endNonce - 1 - index)],
						}),
				)

				const transactions = await Promise.all(promises)
				const filteredTransactions = transactions.filter(Boolean)

				const nextOffset = offset + actualLimit
				const hasMore = nextOffset < transactionCount

				const cacheControl =
					offset === 0
						? 'public, max-age=0, must-revalidate' // No cache for first page
						: 'public, max-age=3600, stale-while-revalidate=86400' // 1hr cache for others

				return Response.json(
					{
						transactions: filteredTransactions,
						total: transactionCount,
						offset: nextOffset, // Next offset to use for pagination
						limit: actualLimit,
						hasMore,
					},
					{
						headers: {
							'Content-Type': 'application/json',
							'Cache-Control': cacheControl,
						},
					},
				)
			},
		},
	},
	params: {
		parse: z.object({
			address: z.pipe(
				z.string(),
				z.transform((x) => {
					Address.assert(x)
					return x
				}),
			),
		}).parse,
	},
	validateSearch: z.object({
		offset: z.coerce.number().int().min(0).default(0).catch(0),
		limit: z.coerce.number().int().min(1).max(1000).default(100).catch(100),
	}),
})
