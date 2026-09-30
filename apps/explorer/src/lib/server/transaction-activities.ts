import { createServerFn } from '@tanstack/react-start'
import { parseResponse } from 'hono/client'
import { parseAbi } from 'viem'
import * as z from 'zod/mini'
import type {
	ActivityDataValue,
	TransactionActivity,
} from '#lib/domain/transaction-activities'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import { api } from '#lib/server/tempo-api'
import { zHash } from '#lib/zod'
import { getBatchedClient, getTempoChain } from '#wagmi.config.ts'

const InputSchema = z.object({ hash: zHash() })

export const fetchTransactionActivities = createServerFn({ method: 'GET' })
	.inputValidator((input) => InputSchema.parse(input))
	.handler(async ({ data }): Promise<TransactionActivity[]> => {
		const chainId = getTempoChain().id
		return withImmutableDataCache({
			key: `transaction-activities:v1:${chainId}:${data.hash.toLowerCase()}`,
			load: async () =>
				enrichVaultTokens(await getTransactionActivities(data.hash, chainId)),
			ttlSeconds: 300,
		})
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

const vaultAbi = parseAbi([
	'function asset() view returns (address)',
	'function earnShare() view returns (address)',
])

async function enrichVaultTokens(
	activities: TransactionActivity[],
): Promise<TransactionActivity[]> {
	const vaults = [
		...new Set(
			activities.flatMap((activity) => {
				const vault = activity.data.vault
				return typeof vault === 'string' && /^0x[\da-f]{40}$/i.test(vault)
					? [vault as `0x${string}`]
					: []
			}),
		),
	]
	if (vaults.length === 0) return activities

	const client = getBatchedClient()
	const tokens = new Map(
		await Promise.all(
			vaults.map(async (vault) => {
				const [asset, share] = await Promise.allSettled([
					client.readContract({
						address: vault,
						abi: vaultAbi,
						functionName: 'asset',
					}),
					client.readContract({
						address: vault,
						abi: vaultAbi,
						functionName: 'earnShare',
					}),
				])
				return [
					vault.toLowerCase(),
					{
						asset: asset.status === 'fulfilled' ? asset.value : undefined,
						share: share.status === 'fulfilled' ? share.value : vault,
					},
				] as const
			}),
		),
	)

	return activities.map((activity) => {
		const vault = activity.data.vault
		if (typeof vault !== 'string') return activity
		const token = tokens.get(vault.toLowerCase())
		if (!token?.asset) return activity
		return {
			...activity,
			data: {
				...activity.data,
				assetToken: token.asset,
				shareToken: token.share,
			},
		}
	})
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
