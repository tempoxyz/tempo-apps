import * as z from 'zod/mini'

/**
 * Tempo Earn vaults, listed without naming who runs them: each row is the
 * vault's asset, engine kind and onchain numbers, never its share token's
 * name or symbol, owner, label or deployment ID, which can name a customer.
 */

export const earnEngines = ['erc4626', 'veda', 'other'] as const
export type EarnEngine = (typeof earnEngines)[number]

export const engineLabels: Record<EarnEngine, string> = {
	erc4626: 'ERC-4626',
	veda: 'Veda',
	other: 'Other',
}

export type EarnVaultToken = {
	address: `0x${string}`
	symbol: string
	decimals: number
}

export type EarnDeployment = {
	factory: `0x${string}`
	block: number
	/** Unix seconds. */
	timestamp: number
}

export type EarnVault = {
	address: `0x${string}`
	asset: EarnVaultToken
	engine: EarnEngine
	/** The engine contract holding the vault's position, when known. */
	engineAddress: `0x${string}` | null
	/** Where the engine deploys assets, such as a lending market, when known. */
	venue: `0x${string}` | null
	/** Registry-curated by Tempo. */
	verified: boolean
	depositsPaused: boolean
	/** Total assets in US dollars, or null when the asset has no USD rate. */
	tvl: number | null
	/** Total assets in the asset's base units. */
	totalAssets: string | null
	openRedeemRequests: number
	deployment: EarnDeployment | null
}

export type EarnSnapshot = {
	vaults: EarnVault[]
	/** False when some deployed vaults could not be read. */
	complete: boolean
}

/** The fields this page reads from the Tempo API's GET /v1/earn/vaults/:id. */
export type ApiEarnVault = {
	vaultAddress: string
	verified?: boolean | null
	assetToken?: { address: string; symbol: string; decimals: number } | null
	engine?: {
		type?: string | null
		address?: string | null
		venue?: string | null
	} | null
	state?: {
		depositsPaused?: boolean | null
		totalAssets?: string | null
		openRedeemRequestCount?: number | null
	} | null
	tvl?: { formatted?: string | null } | null
}

const hexAddress = /^0x[0-9a-fA-F]{40}$/

function addressOrNull(value: string | null | undefined): `0x${string}` | null {
	return value && hexAddress.test(value)
		? (value.toLowerCase() as `0x${string}`)
		: null
}

function toNumber(value: string | null | undefined): number | null {
	if (value === null || value === undefined || value === '') return null
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

/** One API vault as a row, or null when it isn't a readable Earn vault. */
export function toEarnVault(
	vault: ApiEarnVault,
	deployment: EarnDeployment | null = null,
): EarnVault | null {
	const asset = vault.assetToken
	const address = addressOrNull(vault.vaultAddress)
	const assetAddress = addressOrNull(asset?.address)
	if (!address || !asset || !assetAddress || !asset.symbol) return null
	const type = vault.engine?.type
	const totalAssets = vault.state?.totalAssets
	return {
		address,
		asset: {
			address: assetAddress,
			symbol: asset.symbol,
			decimals: asset.decimals,
		},
		engine: type === 'erc4626' || type === 'veda' ? type : 'other',
		engineAddress: addressOrNull(vault.engine?.address),
		venue: addressOrNull(vault.engine?.venue),
		verified: vault.verified === true,
		depositsPaused: vault.state?.depositsPaused === true,
		tvl: toNumber(vault.tvl?.formatted),
		totalAssets:
			typeof totalAssets === 'string' && /^\d+$/.test(totalAssets)
				? totalAssets
				: null,
		openRedeemRequests: vault.state?.openRedeemRequestCount ?? 0,
		deployment,
	}
}

/** The vault address in an EarnStackDeployed log's first indexed topic. */
export function vaultFromTopic(topic: unknown): `0x${string}` | null {
	if (typeof topic !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(topic))
		return null
	return `0x${topic.slice(26).toLowerCase()}`
}

export const earnSearchSchema = z.object({
	asset: z._default(z.string(), 'all'),
	dir: z._default(z.enum(['asc', 'desc']), 'desc'),
	unverified: z._default(z.boolean(), false),
})

export type EarnSearch = z.infer<typeof earnSearchSchema>

export const defaultEarnSearch: EarnSearch = {
	asset: 'all',
	dir: 'desc',
	unverified: false,
}

export function filterVaults(
	vaults: readonly EarnVault[],
	search: Pick<EarnSearch, 'asset' | 'unverified'>,
): EarnVault[] {
	return vaults.filter(
		(vault) =>
			(search.unverified || vault.verified) &&
			(search.asset === 'all' || vault.asset.symbol === search.asset),
	)
}

/** Sorted by TVL, unknown values last, then by address. */
export function sortVaults(
	vaults: readonly EarnVault[],
	dir: 'asc' | 'desc' = 'desc',
): EarnVault[] {
	const sign = dir === 'asc' ? 1 : -1
	return [...vaults].sort((a, b) => {
		if (a.tvl !== b.tvl) {
			if (a.tvl === null) return 1
			if (b.tvl === null) return -1
			return (a.tvl - b.tvl) * sign
		}
		return a.address.localeCompare(b.address)
	})
}

/** Assets with at least one vault, the largest by TVL first. */
export function vaultAssets(vaults: readonly EarnVault[]): string[] {
	const tvl = new Map<string, number>()
	for (const vault of vaults)
		tvl.set(
			vault.asset.symbol,
			(tvl.get(vault.asset.symbol) ?? 0) + (vault.tvl ?? 0),
		)
	return [...tvl.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([symbol]) => symbol)
}

export type EarnTotals = {
	tvl: number
	/** Vaults holding at least $1. */
	funded: number
	/** Distinct assets held. */
	assets: number
}

export function earnTotals(vaults: readonly EarnVault[]): EarnTotals {
	let tvl = 0
	let funded = 0
	for (const vault of vaults) {
		if (vault.tvl === null) continue
		tvl += vault.tvl
		if (vault.tvl >= 1) funded += 1
	}
	return {
		tvl,
		funded,
		assets: new Set(vaults.map((v) => v.asset.symbol)).size,
	}
}

/** A vault's share of TVL among vaults holding the same asset, 0 to 1. */
export function assetShare(
	vault: EarnVault,
	vaults: readonly EarnVault[],
): number | null {
	if (vault.tvl === null) return null
	const total = vaults
		.filter((other) => other.asset.symbol === vault.asset.symbol)
		.reduce((sum, other) => sum + (other.tvl ?? 0), 0)
	return total > 0 ? vault.tvl / total : null
}

export const earnActivityKinds = ['deposit', 'withdrawal'] as const
export type EarnActivityKind = (typeof earnActivityKinds)[number]

/** One deposit or withdrawal, by amount and time, never by who made it. */
export type EarnActivity = {
	id: string
	kind: EarnActivityKind
	/** Amount in the vault asset's base units. */
	assets: string
	transactionHash: `0x${string}`
	block: number
	log: number
	/** Unix seconds. */
	timestamp: number
}

export type EarnFlows = {
	/** Base units of the vault asset. */
	deposited: string
	withdrawn: string
	deposits: number
	withdrawals: number
}

export type EarnVaultActivity = {
	activity: EarnActivity[]
	/** Over the last 30 days. */
	flows: EarnFlows
	/** Base units; null when the vault has no cap. */
	cap: string | null
}

/** Newest first: block, then log index. */
export function sortActivity(items: readonly EarnActivity[]): EarnActivity[] {
	return [...items].sort((a, b) => b.block - a.block || b.log - a.log)
}

/** A cap of 0 or uint256 max means the vault accepts any amount. */
export function capOrNull(value: bigint | null | undefined): string | null {
	if (value === null || value === undefined) return null
	if (value === 0n || value === 2n ** 256n - 1n) return null
	return value.toString()
}
