import { createServerFn } from '@tanstack/react-start'
import { parseResponse } from 'hono/client'
import {
	type ApiEarnVault,
	type EarnSnapshot,
	type EarnVault,
	toEarnVault,
	vaultFromTopic,
} from '#lib/earn'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import { tempoApi } from '#lib/server/env'
import { api } from '#lib/server/tempo-api'
import { getTempoChain } from '#wagmi.config'

/**
 * EarnFactory's EarnStackDeployed, in each version factories have emitted:
 * without and with `maxManagedAssets` and `transferPolicyId`. The vault is
 * the first indexed topic in both.
 */
const STACK_DEPLOYED_SELECTORS = [
	'0x420632dca5c7b108ec3fe8f96f06644917f70c8682f8f66cadc3b03e1fe9301d',
	'0x950acdb981ae9ee0189b7bba6d347b4fb9b24f0e4f630a1b9a388bc5702fd67b',
] as const

/** Bounds a forged flood of events; mainnet has well under a hundred. */
const MAX_VAULTS = 500
const READ_CONCURRENCY = 8
const READ_TIMEOUT_MS = 8_000
const SNAPSHOT_TTL = 60

/** Every vault an EarnStackDeployed log names, oldest first. */
async function discoverVaults(chainId: number): Promise<`0x${string}`[]> {
	const selectors = STACK_DEPLOYED_SELECTORS.map((s) => `'${s}'`).join(', ')
	const response = await api.v1.indexer.query.$get({
		query: {
			chainId: String(chainId),
			engine: 'clickhouse',
			sql: `SELECT topic1, min(block_num) AS block FROM logs
			WHERE selector IN (${selectors})
			GROUP BY topic1 ORDER BY block LIMIT ${MAX_VAULTS}`,
		},
	})
	const result = await parseResponse(response)
	const index = result.columns.indexOf('topic1')
	const vaults = new Set<`0x${string}`>()
	for (const row of result.rows) {
		const vault = vaultFromTopic(row[index])
		if (vault) vaults.add(vault)
	}
	return [...vaults]
}

type VaultRead =
	| { kind: 'vault'; vault: EarnVault }
	| { kind: 'none' }
	| { kind: 'failed' }

/**
 * The vault's live state from the Tempo API, which reads it onchain. A log
 * from a contract that isn't an Earn vault reads as none and is dropped.
 */
async function readVault(
	chainId: number,
	address: `0x${string}`,
): Promise<VaultRead> {
	const url = new URL(`/v1/earn/vaults/${address}`, tempoApi.url)
	url.searchParams.set('chainId', String(chainId))
	url.searchParams.set('include', 'apy,tvl')
	url.searchParams.set('apy.window', '7d')
	try {
		const response = await fetch(url, {
			headers: tempoApi.headers,
			signal: AbortSignal.timeout(READ_TIMEOUT_MS),
		})
		if (response.status === 404 || response.status === 422)
			return { kind: 'none' }
		if (!response.ok) return { kind: 'failed' }
		const vault = toEarnVault((await response.json()) as ApiEarnVault)
		return vault ? { kind: 'vault', vault } : { kind: 'none' }
	} catch {
		return { kind: 'failed' }
	}
}

async function mapLimit<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length)
	let next = 0
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const index = next++
				results[index] = await fn(items[index] as T)
			}
		}),
	)
	return results
}

export async function getEarnVaults(chainId: number): Promise<EarnSnapshot> {
	const addresses = await discoverVaults(chainId)
	const reads = await mapLimit(addresses, READ_CONCURRENCY, (address) =>
		readVault(chainId, address),
	)
	return {
		vaults: reads.flatMap((read) =>
			read.kind === 'vault' ? [read.vault] : [],
		),
		complete: reads.every((read) => read.kind !== 'failed'),
	}
}

export const fetchEarnVaults = createServerFn({ method: 'GET' }).handler(
	async (): Promise<EarnSnapshot> => {
		const chainId = getTempoChain().id
		try {
			return await withImmutableDataCache({
				key: `earn-vaults:v1:${chainId}`,
				ttlSeconds: SNAPSHOT_TTL,
				load: () => getEarnVaults(chainId),
				shouldCache: (snapshot) => snapshot.complete,
			})
		} catch (error) {
			console.error('Failed to load Earn vaults:', error)
			throw new Error(
				'Earn vaults are temporarily unavailable. Please try again.',
			)
		}
	},
)
