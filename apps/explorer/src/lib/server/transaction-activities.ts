import { createServerFn } from '@tanstack/react-start'
import { parseResponse } from 'hono/client'
import * as z from 'zod/mini'
import type { TransactionActivity } from '#lib/domain/transaction-activities'
import { api } from '#lib/server/tempo-api'
import { zHash } from '#lib/zod'
import { getTempoChain } from '#wagmi.config.ts'

const InputSchema = z.object({ hash: zHash() })

export const fetchTransactionActivities = createServerFn({ method: 'GET' })
	.inputValidator((input) => InputSchema.parse(input))
	.handler(async ({ data }): Promise<TransactionActivity[]> => {
		try {
			const upstream = await api.v1.transactions[
				':transactionHash'
			].activities.$get({
				param: { transactionHash: data.hash },
				query: { chainId: String(getTempoChain().id) },
			})
			if (upstream.status === 404) return []
			const response = await parseResponse(Promise.resolve(upstream))
			return response.data.map((activity) => ({
				id: activity.id,
				title: activity.title,
				type: activity.type,
				data: Object.fromEntries(
					Object.entries(activity.data).filter(
						(entry): entry is [string, string | number | boolean] =>
							['string', 'number', 'boolean'].includes(typeof entry[1]),
					),
				),
			}))
		} catch (error) {
			console.error('Failed to fetch transaction activities:', error)
			return []
		}
	})
