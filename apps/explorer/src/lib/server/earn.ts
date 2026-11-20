import { createServerFn } from '@tanstack/react-start'
import { parseResponse } from 'hono/client'
import { parseAbi } from 'viem'
import * as z from 'zod/mini'
import {
	type ApiEarnVault,
	capOrNull,
	type EarnActivity,
	type EarnActivityKind,
	type EarnDeployment,
	type EarnSnapshot,
	type EarnVault,
	type EarnVaultActivity,
	sortActivity,
	toEarnVault,
	vaultFromTopic,
} from '#lib/earn'
import { indexer, sqlTime } from '#lib/server/dex-indexer'
import { tempoApi } from '#lib/server/env'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import { api, instrumentedFetch } from '#lib/server/tempo-api'
import { zAddress } from '#lib/zod'
import { getBatchedClient, getTempoChain } from '#wagmi.config'

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
const ACTIVITY_TTL = 10
const ACTIVITY_ITEMS = 25
const FLOW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

type Discovery = {
	vaults: { address: `0x${string}`; deployment: EarnDeployment | null }[]
	truncated: boolean
}

const hexAddress = /^0x[0-9a-f]{40}$/

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
			sql: `SELECT topic1, min(block_num) AS block,
			min(toUnixTimestamp(block_timestamp)) AS ts, any(address) AS factory
			FROM logs WHERE selector IN (${selectors})${from}
			GROUP BY topic1 ORDER BY block LIMIT ${MAX_VAULTS + 1}`,
		},
	})
	const result = await parseResponse(response)
	const column = (name: string) => result.columns.indexOf(name)
	const [topic, block, ts, factory] = [
		column('topic1'),
		column('block'),
		column('ts'),
		column('factory'),
	]
	const seen = new Set<string>()
	const vaults: Discovery['vaults'] = []
	for (const row of result.rows.slice(0, MAX_VAULTS)) {
		const address = vaultFromTopic(row[topic])
		if (!address || seen.has(address)) continue
		seen.add(address)
		const deployer = String(row[factory] ?? '').toLowerCase()
		vaults.push({
			address,
			deployment: hexAddress.test(deployer)
				? {
						factory: deployer as `0x${string}`,
						block: Number(row[block]),
						timestamp: Number(row[ts]),
					}
				: null,
		})
	}
	return { vaults, truncated: result.rows.length > MAX_VAULTS }
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
	deployment: EarnDeployment | null,
): Promise<VaultRead> {
	const url = new URL(`${tempoApi.url}/v1/earn/vaults/${address}`)
	url.searchParams.set('chainId', String(chainId))
	url.searchParams.set('include', 'tvl')
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
		const vault = toEarnVault(
			(await response.json()) as ApiEarnVault,
			deployment,
		)
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
	const { vaults: found, truncated } = await discoverVaults(chainId)
	const reads = await mapLimit(found, READ_CONCURRENCY, (item) =>
		readVault(chainId, item.address, item.deployment),
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
				key: `earn-vaults:v3:${chainId}`,
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

/**
 * The EarnVault events that move assets in or out, as the indexer's decoded
 * tables: the table name, the column holding the asset amount, and whether
 * it is a deposit. Veda vaults pay async redemptions out in RedeemFinalized.
 */
const FLOW_EVENTS: {
	signature: string
	table: string
	kind: EarnActivityKind
	/** Restrict to payouts in the vault's own asset. */
	assetColumn?: string
}[] = [
	{
		signature:
			'Deposited(address indexed caller, address indexed receiver, uint256 assets, uint256 earnShares)',
		table: 'deposited',
		kind: 'deposit',
	},
	{
		signature:
			'Redeemed(address indexed caller, address indexed receiver, uint256 earnShares, uint256 assets)',
		table: 'redeemed',
		kind: 'withdrawal',
	},
	{
		signature:
			'WithdrewExact(address indexed caller, address indexed receiver, uint256 assets, uint256 earnSharesBurned)',
		table: 'withdrewexact',
		kind: 'withdrawal',
	},
	{
		signature:
			'RedeemFinalized(bytes32 indexed requestId, address indexed receiver, uint256 earnShares, address asset, uint256 assets)',
		table: 'redeemfinalized',
		kind: 'withdrawal',
		assetColumn: 'asset',
	},
]

const maxManagedAssetsAbi = parseAbi([
	'function maxManagedAssets() view returns (uint256)',
])

const hexHash = /^0x[0-9a-f]{64}$/
const digits = /^\d+$/

async function readCap(vault: `0x${string}`): Promise<string | null> {
	try {
		const cap = await getBatchedClient().readContract({
			address: vault,
			abi: maxManagedAssetsAbi,
			functionName: 'maxManagedAssets',
		})
		return capOrNull(cap)
	} catch {
		return null
	}
}

export async function getEarnVaultActivity(
	chainId: number,
	vault: `0x${string}`,
	asset: `0x${string}`,
): Promise<EarnVaultActivity> {
	const since = sqlTime(Date.now() - FLOW_WINDOW_MS)
	const where = (event: (typeof FLOW_EVENTS)[number]) =>
		`address = '${vault}'${event.assetColumn ? ` AND ${event.assetColumn} = '${asset}'` : ''}`
	const [recent, totals, cap] = await Promise.all([
		Promise.all(
			FLOW_EVENTS.map(async (event) =>
				(
					await indexer(
						chainId,
						`SELECT block_num, log_idx, tx_hash,
						toUnixTimestamp(block_timestamp) AS ts, toString(assets) AS amount
						FROM ${event.table} WHERE ${where(event)}
						ORDER BY block_num DESC, log_idx DESC LIMIT ${ACTIVITY_ITEMS}`,
						event.signature,
					)
				).flatMap((row): EarnActivity[] => {
					const hash = String(row.tx_hash ?? '').toLowerCase()
					const amount = String(row.amount ?? '')
					if (!hexHash.test(hash) || !digits.test(amount)) return []
					const block = Number(row.block_num)
					const log = Number(row.log_idx)
					return [
						{
							id: `${hash}:${log}`,
							kind: event.kind,
							assets: amount,
							transactionHash: hash as `0x${string}`,
							block,
							log,
							timestamp: Number(row.ts),
						},
					]
				}),
			),
		),
		Promise.all(
			FLOW_EVENTS.map(async (event) => {
				const [row] = await indexer(
					chainId,
					`SELECT count() AS n, toString(sum(assets)) AS total
					FROM ${event.table}
					WHERE ${where(event)} AND block_timestamp >= '${since}'`,
					event.signature,
				)
				const total = String(row?.total ?? '0')
				return {
					kind: event.kind,
					count: Number(row?.n ?? 0),
					total: digits.test(total) ? BigInt(total) : 0n,
				}
			}),
		),
		readCap(vault),
	])
	let deposited = 0n
	let withdrawn = 0n
	let deposits = 0
	let withdrawals = 0
	for (const total of totals) {
		if (total.kind === 'deposit') {
			deposited += total.total
			deposits += total.count
		} else {
			withdrawn += total.total
			withdrawals += total.count
		}
	}
	return {
		activity: sortActivity(recent.flat()).slice(0, ACTIVITY_ITEMS),
		flows: {
			deposited: deposited.toString(),
			withdrawn: withdrawn.toString(),
			deposits,
			withdrawals,
		},
		cap,
	}
}

const activityInputSchema = z.object({
	vault: zAddress({ lowercase: true }),
	asset: zAddress({ lowercase: true }),
})

export const fetchEarnVaultActivity = createServerFn({ method: 'GET' })
	.inputValidator((input: { vault: string; asset: string }) =>
		activityInputSchema.parse(input),
	)
	.handler(async ({ data }): Promise<EarnVaultActivity> => {
		const chainId = getTempoChain().id
		const vault = data.vault.toLowerCase() as `0x${string}`
		const asset = data.asset.toLowerCase() as `0x${string}`
		try {
			return await withImmutableDataCache({
				key: `earn-vault-activity:v1:${chainId}:${vault}:${asset}`,
				ttlSeconds: ACTIVITY_TTL,
				load: () => getEarnVaultActivity(chainId, vault, asset),
			})
		} catch (error) {
			console.error('Failed to load Earn vault activity:', error)
			throw new Error(
				'Vault activity is temporarily unavailable. Please try again.',
			)
		}
	})
