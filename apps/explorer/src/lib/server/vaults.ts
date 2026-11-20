import { createServerFn } from '@tanstack/react-start'
import { parseResponse } from 'hono/client'
import { type ContractFunctionParameters, erc20Abi, parseAbi } from 'viem'
import * as z from 'zod/mini'
import { indexer, sqlTime } from '#lib/server/dex-indexer'
import { tempoApi } from '#lib/server/env'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import { api, instrumentedFetch } from '#lib/server/tempo-api'
import { getVerifiedTokens } from '#lib/server/verified-tokens'
import {
	type ApiEarnVault,
	type Erc4626Read,
	type Hex40,
	mergeVaults,
	sortActivity,
	toErc4626Vault,
	toEarnVault,
	type Vault,
	type VaultActivity,
	type VaultActivityKind,
	type VaultActivityResult,
	type VaultDeployment,
	type VaultKind,
	type VaultSnapshot,
	vaultFromTopic,
	toVaultCap,
	type VaultCap,
	vaultKinds,
} from '#lib/vaults'
import { getTempoEnv } from '#lib/env'
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

/** ERC-4626 Deposit(address,address,uint256,uint256). */
const ERC4626_DEPOSIT =
	'0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7'

/**
 * EarnFactory deployments whose vaults are listed, by chain. Any contract
 * can emit an EarnStackDeployed log, so where a chain has a list only these
 * factories count, and forged logs can't crowd out real vaults.
 */
const EARN_FACTORIES: Record<number, readonly Hex40[]> = {
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

/** Most vaults of each kind read per snapshot; reaching it marks it partial. */
const MAX_VAULTS = 500
const READ_CONCURRENCY = 8
const READ_TIMEOUT_MS = 8_000
const SNAPSHOT_TTL = 60
/** A partial snapshot is cached briefly, so failing reads stay bounded. */
const PARTIAL_SNAPSHOT_TTL = 15
const ACTIVITY_TTL = 10
const ACTIVITY_ITEMS = 25
const FLOW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

const hexAddress = /^0x[0-9a-f]{40}$/
const hexHash = /^0x[0-9a-f]{64}$/
const digits = /^\d+$/

type EarnDiscovery = {
	vaults: { address: Hex40; deployment: VaultDeployment | null }[]
	truncated: boolean
}

/** Every vault an EarnStackDeployed log names, oldest first. */
async function discoverEarnVaults(chainId: number): Promise<EarnDiscovery> {
	const selectors = STACK_DEPLOYED_SELECTORS.map((s) => `'${s}'`).join(', ')
	const factories = EARN_FACTORIES[chainId]
	// Without a trusted factory list, any contract's logs would count, so
	// a chain without one lists no Earn vaults.
	if (!factories) return { vaults: [], truncated: false }
	const from = ` AND address IN (${factories.map((f) => `'${f}'`).join(', ')})`
	const result = await parseResponse(
		await api.v1.indexer.query.$get({
			query: {
				chainId: String(chainId),
				engine: 'clickhouse',
				sql: `SELECT topic1, min(block_num) AS block,
				min(toUnixTimestamp(block_timestamp)) AS ts, any(address) AS factory
				FROM logs WHERE selector IN (${selectors})${from}
				GROUP BY topic1 ORDER BY block LIMIT ${MAX_VAULTS + 1}`,
			},
		}),
	)
	const column = (name: string) => {
		const index = result.columns.indexOf(name)
		if (index < 0) throw new Error(`Indexer result has no ${name} column`)
		return index
	}
	const [topic, block, ts, factory] = ['topic1', 'block', 'ts', 'factory'].map(
		column,
	)
	const seen = new Set<string>()
	const vaults: EarnDiscovery['vaults'] = []
	for (const row of result.rows.slice(0, MAX_VAULTS)) {
		const address = vaultFromTopic(row[topic as number])
		if (!address || seen.has(address)) continue
		seen.add(address)
		const deployer = String(row[factory as number] ?? '').toLowerCase()
		vaults.push({
			address,
			deployment: hexAddress.test(deployer)
				? {
						factory: deployer as Hex40,
						block: Number(row[block as number]),
						timestamp: Number(row[ts as number]),
					}
				: null,
		})
	}
	return { vaults, truncated: result.rows.length > MAX_VAULTS }
}

type VaultRead =
	| { kind: 'vault'; vault: Vault }
	| { kind: 'none' }
	| { kind: 'failed' }

/** An Earn vault's live state from the Tempo API, which reads it onchain. */
async function readEarnVault(
	chainId: number,
	address: Hex40,
	deployment: VaultDeployment | null,
): Promise<VaultRead> {
	const url = new URL(`${tempoApi.url}/v1/earn/vaults/${address}`)
	url.searchParams.set('chainId', String(chainId))
	url.searchParams.set('include', 'tvl')
	try {
		const response = await instrumentedFetch(url, {
			headers: tempoApi.headers,
			// Never follow a redirect, which would send the API credentials on.
			redirect: 'manual',
			signal: AbortSignal.timeout(READ_TIMEOUT_MS),
		})
		if (response.status === 404 || response.status === 422)
			return { kind: 'none' }
		if (!response.ok || response.redirected) {
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
		// A vault the API answers for but can't describe is a failed read,
		// so the snapshot is marked partial instead of silently dropping it.
		return vault ? { kind: 'vault', vault } : { kind: 'failed' }
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

async function getEarnVaults(chainId: number): Promise<VaultSnapshot> {
	const { vaults: found, truncated } = await discoverEarnVaults(chainId)
	const reads = await mapLimit(found, READ_CONCURRENCY, (item) =>
		readEarnVault(chainId, item.address, item.deployment),
	)
	return {
		vaults: reads.flatMap((read) =>
			read.kind === 'vault' ? [read.vault] : [],
		),
		complete: !truncated && reads.every((read) => read.kind !== 'failed'),
	}
}

const MULTICALL_CHUNK = 60

/** Runs a multicall in chunks, so one large batch can't stall the snapshot. */
async function chunkedMulticall(
	contracts: readonly ContractFunctionParameters[],
): Promise<{ status: 'success' | 'failure'; result?: unknown }[]> {
	const client = getBatchedClient()
	const chunks: ContractFunctionParameters[][] = []
	for (let i = 0; i < contracts.length; i += MULTICALL_CHUNK)
		chunks.push(contracts.slice(i, i + MULTICALL_CHUNK))
	const results = await Promise.all(
		chunks.map((chunk) =>
			client.multicall({
				allowFailure: true,
				deployless: true,
				contracts: chunk,
			}),
		),
	)
	return results.flat() as { status: 'success' | 'failure'; result?: unknown }[]
}

const erc4626Abi = parseAbi([
	'function asset() view returns (address)',
	'function totalAssets() view returns (uint256)',
])
const currencyAbi = parseAbi(['function currency() view returns (string)'])

/**
 * Every contract that emitted an ERC-4626 Deposit, read onchain with
 * `asset()` and `totalAssets()`. Contracts that don't answer both aren't
 * vaults and are dropped.
 */
async function getErc4626Vaults(chainId: number): Promise<VaultSnapshot> {
	const rows = await indexer(
		chainId,
		`SELECT address, count() AS deposits, min(block_num) AS block,
		min(toUnixTimestamp(block_timestamp)) AS ts
		FROM logs WHERE selector = '${ERC4626_DEPOSIT}'
		GROUP BY address ORDER BY deposits DESC LIMIT ${MAX_VAULTS + 1}`,
	)
	const candidates = rows.slice(0, MAX_VAULTS).flatMap((row) => {
		const address = String(row.address ?? '').toLowerCase()
		return hexAddress.test(address)
			? [
					{
						address: address as Hex40,
						block: Number(row.block),
						ts: Number(row.ts),
					},
				]
			: []
	})
	const [state, verified] = await Promise.all([
		chunkedMulticall(
			candidates.flatMap((c) => [
				{ address: c.address, abi: erc4626Abi, functionName: 'asset' } as const,
				{
					address: c.address,
					abi: erc4626Abi,
					functionName: 'totalAssets',
				} as const,
			]),
		),
		getVerifiedTokens(chainId),
	])
	const verifiedTokens = new Map(
		verified.map((t) => [t.address.toLowerCase(), t]),
	)
	const assetOf = (index: number) => {
		const result = state[index * 2]
		return result?.status === 'success'
			? String(result.result).toLowerCase()
			: null
	}
	const unknownAssets = [
		...new Set(
			candidates
				.map((_, index) => assetOf(index))
				.filter((a): a is string => a !== null && !verifiedTokens.has(a)),
		),
	] as Hex40[]
	const metadata = await chunkedMulticall(
		unknownAssets.flatMap((address) => [
			{ address, abi: erc20Abi, functionName: 'symbol' } as const,
			{ address, abi: erc20Abi, functionName: 'decimals' } as const,
			{ address, abi: currencyAbi, functionName: 'currency' } as const,
		]),
	)
	const tokens = new Map<string, Erc4626Read['token']>()
	for (const [address, token] of verifiedTokens)
		tokens.set(address, {
			symbol: token.symbol,
			decimals: token.decimals,
			currency: token.currency ?? null,
		})
	unknownAssets.forEach((address, index) => {
		const [symbol, decimals, currency] = metadata.slice(
			index * 3,
			index * 3 + 3,
		)
		if (symbol?.status !== 'success' || decimals?.status !== 'success') return
		tokens.set(address, {
			symbol: String(symbol.result).slice(0, 16),
			decimals: Number(decimals.result),
			currency: currency?.status === 'success' ? String(currency.result) : null,
		})
	})
	const vaults = candidates.flatMap((candidate, index) => {
		const asset = assetOf(index)
		const total = state[index * 2 + 1]
		if (!asset || total?.status !== 'success') return []
		const vault = toErc4626Vault({
			address: candidate.address,
			asset,
			totalAssets: total.result as bigint,
			token: tokens.get(asset) ?? null,
			verifiedAsset: verifiedTokens.has(asset),
			firstBlock: candidate.block,
			firstTimestamp: candidate.ts,
		})
		return vault ? [vault] : []
	})
	return { vaults, complete: rows.length <= MAX_VAULTS }
}

export async function getVaults(chainId: number): Promise<VaultSnapshot> {
	const [earn, erc4626] = await Promise.all([
		getEarnVaults(chainId),
		getErc4626Vaults(chainId).catch((error) => {
			console.error('ERC-4626 vault discovery failed', error)
			return { vaults: [], complete: false } satisfies VaultSnapshot
		}),
	])
	return {
		vaults: mergeVaults(earn.vaults, erc4626.vaults),
		complete: earn.complete && erc4626.complete,
	}
}

/** Loads in flight, by cache key, so concurrent misses share one refresh. */
const inflight = new Map<string, Promise<unknown>>()

function coalesce<T>(key: string, load: () => Promise<T>): Promise<T> {
	const pending = inflight.get(key) as Promise<T> | undefined
	if (pending) return pending
	const next = load().finally(() => inflight.delete(key))
	inflight.set(key, next)
	return next
}

/** Devnet and nextfork share a chain ID, so keys name the network too. */
function networkKey(chainId: number): string {
	return `${getTempoEnv()}:${chainId}`
}

/** Keeps a 402, 403 or 429 in the message so clients don't retry it. */
function unavailable(message: string, error: unknown): Error {
	const text = error instanceof Error ? error.message : String(error)
	const status = /\b(402|403|429)\b/.exec(text)?.[1]
	return new Error(status ? `${message} (status: ${status})` : message)
}

export const fetchVaults = createServerFn({ method: 'GET' }).handler(
	async (): Promise<VaultSnapshot> => {
		const chainId = getTempoChain().id
		try {
			const key = `vaults:v2:${networkKey(chainId)}`
			return await withImmutableDataCache({
				key,
				ttlSeconds: (snapshot) =>
					snapshot.complete ? SNAPSHOT_TTL : PARTIAL_SNAPSHOT_TTL,
				load: () => coalesce(key, () => getVaults(chainId)),
			})
		} catch (error) {
			console.error('Failed to load vaults:', error)
			throw unavailable(
				'Vaults are temporarily unavailable. Please try again.',
				error,
			)
		}
	},
)

type FlowEvent = {
	signature: string
	table: string
	kind: VaultActivityKind
	/** Restrict to payouts in the vault's own asset. */
	assetColumn?: string
}

/**
 * The events that move assets in or out of each kind of vault, as the
 * indexer's decoded tables. Veda Earn vaults pay async redemptions out in
 * RedeemFinalized.
 */
const FLOW_EVENTS: Record<VaultKind, FlowEvent[]> = {
	earn: [
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
	],
	erc4626: [
		{
			signature:
				'Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
			table: 'deposit',
			kind: 'deposit',
		},
		{
			signature:
				'Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
			table: 'withdraw',
			kind: 'withdrawal',
		},
	],
}

const maxManagedAssetsAbi = parseAbi([
	'function maxManagedAssets() view returns (uint256)',
])

async function readCap(kind: VaultKind, vault: Hex40): Promise<VaultCap> {
	if (kind !== 'earn') return { status: 'unknown' }
	try {
		const cap = await getBatchedClient().readContract({
			address: vault,
			abi: maxManagedAssetsAbi,
			functionName: 'maxManagedAssets',
		})
		return toVaultCap(cap)
	} catch {
		return { status: 'unknown' }
	}
}

export async function getVaultActivity(
	chainId: number,
	kind: VaultKind,
	vault: Hex40,
	asset: Hex40,
): Promise<VaultActivityResult> {
	const events = FLOW_EVENTS[kind]
	const since = sqlTime(Date.now() - FLOW_WINDOW_MS)
	const where = (event: FlowEvent) =>
		`address = '${vault}'${event.assetColumn ? ` AND ${event.assetColumn} = '${asset}'` : ''}`
	const [recent, totals, cap] = await Promise.all([
		Promise.all(
			events.map(async (event) =>
				(
					await indexer(
						chainId,
						`SELECT block_num, log_idx, tx_hash,
						toUnixTimestamp(block_timestamp) AS ts, toString(assets) AS amount
						FROM ${event.table} WHERE ${where(event)}
						ORDER BY block_num DESC, log_idx DESC LIMIT ${ACTIVITY_ITEMS}`,
						event.signature,
					)
				).flatMap((row): VaultActivity[] => {
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
			events.map(async (event) => {
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
		readCap(kind, vault),
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
	kind: z.enum(vaultKinds),
	vault: zAddress({ lowercase: true }),
	asset: zAddress({ lowercase: true }),
})

export const fetchVaultActivity = createServerFn({ method: 'GET' })
	.inputValidator((input: { kind: VaultKind; vault: string; asset: string }) =>
		activityInputSchema.parse(input),
	)
	.handler(async ({ data }): Promise<VaultActivityResult> => {
		const chainId = getTempoChain().id
		const vault = data.vault.toLowerCase() as Hex40
		const asset = data.asset.toLowerCase() as Hex40
		try {
			const key = `vault-activity:v2:${networkKey(chainId)}:${data.kind}:${vault}:${asset}`
			return await withImmutableDataCache({
				key,
				ttlSeconds: ACTIVITY_TTL,
				load: () =>
					coalesce(key, () =>
						getVaultActivity(chainId, data.kind, vault, asset),
					),
			})
		} catch (error) {
			console.error('Failed to load vault activity:', error)
			throw unavailable(
				'Vault activity is temporarily unavailable. Please try again.',
				error,
			)
		}
	})
