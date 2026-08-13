import { createServerFn } from '@tanstack/react-start'
import { parseResponse } from 'hono/client'
import * as z from 'zod/mini'
import type {
	ActivityDataValue,
	TransactionActivity,
} from '#lib/domain/transaction-activities'
import { api } from '#lib/server/tempo-api'
import { zHash } from '#lib/zod'
import { getTempoChain } from '#wagmi.config.ts'

const InputSchema = z.object({ hash: zHash() })

export const fetchTransactionActivities = createServerFn({ method: 'GET' })
	.inputValidator((input) => InputSchema.parse(input))
	.handler(async ({ data }): Promise<TransactionActivity[]> => {
		return getTransactionActivities(data.hash, getTempoChain().id)
	})

export async function getTransactionActivities(
	hash: `0x${string}`,
	chainId: number,
): Promise<TransactionActivity[]> {
	try {
		const upstream = await api.v1.transactions[
			':transactionHash'
		].activities.$get({
			param: { transactionHash: hash },
			query: { chainId: String(chainId) },
		})
		if (upstream.status === 404) return []
		const response = await parseResponse(Promise.resolve(upstream))
		return response.data.map((activity) => ({
			id: activity.id,
			title: activity.title,
			type: activity.type,
			data: normalizeActivityData(activity.data),
		}))
	} catch (error) {
		console.error('Failed to fetch transaction activities:', error)
		return []
	}
}

function normalizeActivityData(
	value: object,
): Record<string, ActivityDataValue> {
	return Object.fromEntries(
		Object.entries(value).flatMap(([key, nested]) => {
			const normalized = normalizeActivityValue(nested)
			return normalized === undefined ? [] : [[key, normalized]]
		}),
	)
}

function normalizeActivityValue(value: unknown): ActivityDataValue | undefined {
	if (value === null) return null
	if (['string', 'number', 'boolean'].includes(typeof value))
		return value as string | number | boolean
	if (Array.isArray(value)) {
		return value.flatMap((item) => {
			const normalized = normalizeActivityValue(item)
			return normalized === undefined ? [] : [normalized]
		})
	}
	if (typeof value === 'object') return normalizeActivityData(value)
}
