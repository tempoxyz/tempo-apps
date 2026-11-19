import { createServerFn } from '@tanstack/react-start'
import { parseResponse } from 'hono/client'
import {
	type ApiEarnVault,
	type EarnSnapshot,
	type EarnVault,
	toEarnVault,
	vaultFromTopic,
} from '#lib/earn'
import { tempoApi } from '#lib/server/env'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import { api, instrumentedFetch } from '#lib/server/tempo-api'
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

/**
 * EarnFactory deployments whose vaults this page lists, by chain. Any
 * contract can emit an EarnStackDeployed log, so where a chain has a list
 * only these factories count, and forged logs can't crowd out real vaults.
 * A new factory needs adding here before its vaults show.
 */
const EARN_FACTORIES: Record<number, readonly `0x${string}`[]> = {
	4217: [
		'0x0330b3b81078530570777f52a23622afa7e558d5',
		'0x1428ffbd4469c3e4492f7a4a58e861deb5ed1d05',
		'0x3085a8003f340cd51c72d9e1a1298cdafb171b02',
		'0x31a80ba751030331ad32c0ac44c71f9e2bca8f52',
		'0x55e652e125cc54d41ce466eb0d5aa67e7d2aacfa',
		'0x5b972d2490d06e436982fab77612fd9987f097d0',
		'0x6e11d405d1ebb28801de0a004e9a79147e595042',
		'0x75b20eafdbd3dd974d00b573fd72852ab0237afd',
		'0x9a7bd246be320158602d2a5b731369643b921e9f',
		'0xadef56d9fa2dd2dbc73a2a366057415f1ab30e31',
		'0xb5889a96114014d4c032ebd76772c10bf3b97137',
		'0xcbb8ee2500c488d76ebba47673725dece436143f',
	],
}

/** Most vaults read per snapshot; reaching it marks the snapshot partial. */
const MAX_VAULTS = 500
const READ_CONCURRENCY = 8
const READ_TIMEOUT_MS = 8_000
const SNAPSHOT_TTL = 60
/** A partial snapshot is cached briefly, so failing reads stay bounded. */
const PARTIAL_SNAPSHOT_TTL = 15

type Discovery = { vaults: `0x${string}`[]; truncated: boolean }

/** Every vault an EarnStackDeployed log names, oldest first. */
async function discoverVaults(chainId: number): Promise<Discovery> {
	const selectors = STACK_DEPLOYED_SELECTORS.map((s) => `'${s}'`).join(', ')
	const factories = EARN_FACTORIES[chainId]
	const from = factories
		? ` AND address IN (${factories.map((f) => `'${f}'`).join(', ')})`
		: ''
	const response = await api.v1.indexer.query.$get({
		query: {
			chainId: String(chainId),
			engine: 'clickhouse',
			sql: `SELECT topic1, min(block_num) AS block FROM logs
			WHERE selector IN (${selectors})${from}
			GROUP BY topic1 ORDER BY block LIMIT ${MAX_VAULTS + 1}`,
		},
	})
	const result = await parseResponse(response)
	const index = result.columns.indexOf('topic1')
	const vaults = new Set<`0x${string}`>()
	for (const row of result.rows.slice(0, MAX_VAULTS)) {
		const vault = vaultFromTopic(row[index])
		if (vault) vaults.add(vault)
	}
	return { vaults: [...vaults], truncated: result.rows.length > MAX_VAULTS }
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
	const url = new URL(`${tempoApi.url}/v1/earn/vaults/${address}`)
	url.searchParams.set('chainId', String(chainId))
	url.searchParams.set('include', 'apy,tvl')
	url.searchParams.set('apy.window', '7d')
	try {
		const response = await instrumentedFetch(url, {
			headers: tempoApi.headers,
			signal: AbortSignal.timeout(READ_TIMEOUT_MS),
		})
		if (response.status === 404 || response.status === 422)
			return { kind: 'none' }
		if (!response.ok) {
			console.error('Earn vault read failed', {
				address,
				status: response.status,
			})
			return { kind: 'failed' }
		}
		const vault = toEarnVault((await response.json()) as ApiEarnVault)
		return vault ? { kind: 'vault', vault } : { kind: 'none' }
	} catch (error) {
		console.error('Earn vault read failed', { address, error })
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
	const { vaults: addresses, truncated } = await discoverVaults(chainId)
	const reads = await mapLimit(addresses, READ_CONCURRENCY, (address) =>
		readVault(chainId, address),
	)
	return {
		vaults: reads.flatMap((read) =>
			read.kind === 'vault' ? [read.vault] : [],
		),
		complete: !truncated && reads.every((read) => read.kind !== 'failed'),
	}
}

export const fetchEarnVaults = createServerFn({ method: 'GET' }).handler(
	async (): Promise<EarnSnapshot> => {
		const chainId = getTempoChain().id
		try {
			return await withImmutableDataCache({
				key: `earn-vaults:v2:${chainId}`,
				ttlSeconds: (snapshot) =>
					snapshot.complete ? SNAPSHOT_TTL : PARTIAL_SNAPSHOT_TTL,
				load: () => getEarnVaults(chainId),
			})
		} catch (error) {
			console.error('Failed to load Earn vaults:', error)
			throw new Error(
				'Earn vaults are temporarily unavailable. Please try again.',
			)
		}
	},
)
