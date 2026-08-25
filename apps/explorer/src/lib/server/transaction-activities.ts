import { createServerFn } from '@tanstack/react-start'
import { parseResponse } from 'hono/client'
import * as Address from 'ox/Address'
import { parseAbi } from 'viem'
import { getPublicClient } from 'wagmi/actions'
import * as z from 'zod/mini'
import type {
	ActivityDataValue,
	TransactionActivity,
} from '#lib/domain/transaction-activities'
import { api } from '#lib/server/tempo-api'
import { zHash } from '#lib/zod'
import { getTempoChain, getWagmiConfig } from '#wagmi.config.ts'

const InputSchema = z.object({ hash: zHash() })
const VAULT_ACTIVITY_TYPES = new Set([
	'assets-deposited',
	'assets-withdrawn',
	'private-assets-deposited',
	'private-shares-redeemed',
	'shares-redeemed',
	'shares-redemption-finalized',
])
const EARN_VAULT_ABI = parseAbi([
	'function asset() view returns (address)',
	'function earnShare() view returns (address)',
])

type VaultTokens = {
	asset: Address.Address
	share: Address.Address
}

const vaultTokensCache = new Map<string, Promise<VaultTokens | null>>()

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
		const activities = response.data.map((activity) => ({
			id: activity.id,
			title: activity.title,
			type: activity.type,
			data: normalizeActivityData(activity.data),
		}))
		return Promise.all(
			activities.map(async (activity) => {
				if (!VAULT_ACTIVITY_TYPES.has(activity.type)) return activity
				const vault = activity.data.vault
				if (typeof vault !== 'string' || !Address.validate(vault))
					return activity
				const tokens = await getVaultTokens(vault, chainId)
				return tokens
					? {
							...activity,
							data: {
								...activity.data,
								vaultAssetToken: tokens.asset,
								vaultShareToken: tokens.share,
							},
						}
					: activity
			}),
		)
	} catch (error) {
		console.error('Failed to fetch transaction activities:', error)
		return []
	}
}

function getVaultTokens(
	vault: Address.Address,
	chainId: number,
): Promise<VaultTokens | null> {
	const key = `${chainId}:${vault.toLowerCase()}`
	const cached = vaultTokensCache.get(key)
	if (cached) return cached

	const promise = (async () => {
		const client = getPublicClient(getWagmiConfig(), { chainId })
		if (!client) return null
		const [asset, share] = await Promise.all([
			client.readContract({
				abi: EARN_VAULT_ABI,
				address: vault,
				functionName: 'asset',
			}),
			client.readContract({
				abi: EARN_VAULT_ABI,
				address: vault,
				functionName: 'earnShare',
			}),
		])
		return { asset: Address.from(asset), share: Address.from(share) }
	})().catch(() => {
		vaultTokensCache.delete(key)
		return null
	})
	vaultTokensCache.set(key, promise)
	return promise
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
