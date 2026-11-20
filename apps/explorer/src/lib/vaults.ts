import * as z from 'zod/mini'

/**
 * Vaults on Tempo: Tempo Earn vaults and standard ERC-4626 vaults, listed
 * without naming who runs them. A row is the vault's asset, kind and onchain
 * numbers, never its share token's name or symbol, owner, label or deployment
 * ID, which can name a customer or curator.
 */

export const vaultKinds = ['earn', 'erc4626'] as const
export type VaultKind = (typeof vaultKinds)[number]

export const kindLabels: Record<VaultKind, string> = {
	earn: 'Tempo Earn',
	erc4626: 'ERC-4626',
}

export const earnEngines = ['erc4626', 'veda', 'other'] as const
export type EarnEngine = (typeof earnEngines)[number]

export const engineLabels: Record<EarnEngine, string> = {
	erc4626: 'ERC-4626',
	veda: 'Veda',
	other: 'Other',
}

export type Hex40 = `0x${string}`

export type VaultToken = {
	address: Hex40
	symbol: string
	decimals: number
}

export type VaultDeployment = {
	/** The EarnFactory for Earn vaults; null for ERC-4626 vaults. */
	factory: Hex40 | null
	block: number
	/** Unix seconds. */
	timestamp: number
}

export type Vault = {
	address: Hex40
	kind: VaultKind
	asset: VaultToken
	/** Earn vaults only: the engine kind holding the position. */
	engine: EarnEngine | null
	engineAddress: Hex40 | null
	/** Earn vaults only: where the engine deploys assets, when known. */
	venue: Hex40 | null
	/**
	 * Earn: in Tempo's curated registry. ERC-4626: holds a token on the
	 * verified token list, so its asset and value can be trusted.
	 */
	verified: boolean
	depositsPaused: boolean
	/** Total assets in US dollars, or null when the asset has no USD rate. */
	tvl: number | null
	/** Total assets in the asset's base units. */
	totalAssets: string | null
	openRedeemRequests: number
	deployment: VaultDeployment | null
	/** Earn vaults that deposit into this vault. */
	usedBy: Hex40[]
}

export type VaultSnapshot = {
	vaults: Vault[]
	/** False when some vaults could not be read. */
	complete: boolean
}

/** The fields read from the Tempo API's GET /v1/earn/vaults/:id. */
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
const digits = /^\d+$/

export function addressOrNull(value: string | null | undefined): Hex40 | null {
	return value && hexAddress.test(value) ? (value.toLowerCase() as Hex40) : null
}

function toNumber(value: string | null | undefined): number | null {
	if (value === null || value === undefined || value === '') return null
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

/** One Earn API vault as a row, or null when it isn't a readable vault. */
export function toEarnVault(
	vault: ApiEarnVault,
	deployment: VaultDeployment | null = null,
): Vault | null {
	const asset = vault.assetToken
	const address = addressOrNull(vault.vaultAddress)
	const assetAddress = addressOrNull(asset?.address)
	if (!address || !asset || !assetAddress || !asset.symbol) return null
	const type = vault.engine?.type
	const totalAssets = vault.state?.totalAssets
	return {
		address,
		kind: 'earn',
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
			typeof totalAssets === 'string' && digits.test(totalAssets)
				? totalAssets
				: null,
		openRedeemRequests: vault.state?.openRedeemRequestCount ?? 0,
		deployment,
		usedBy: [],
	}
}

/** A standard ERC-4626 vault read onchain. */
export type Erc4626Read = {
	address: string
	asset: string
	totalAssets: bigint
	token: { symbol: string; decimals: number; currency: string | null } | null
	verifiedAsset: boolean
	firstBlock: number
	firstTimestamp: number
}

/**
 * One ERC-4626 vault as a row, or null when it holds nothing or its asset
 * can't be read. Only USD assets on the verified token list get a USD value.
 */
export function toErc4626Vault(read: Erc4626Read): Vault | null {
	const address = addressOrNull(read.address)
	const asset = addressOrNull(read.asset)
	if (!address || !asset || !read.token || read.totalAssets <= 0n) return null
	const { symbol, decimals, currency } = read.token
	const units = Number(read.totalAssets) / 10 ** decimals
	return {
		address,
		kind: 'erc4626',
		asset: { address: asset, symbol, decimals },
		engine: null,
		engineAddress: null,
		venue: null,
		verified: read.verifiedAsset,
		depositsPaused: false,
		tvl: read.verifiedAsset && currency === 'USD' ? units : null,
		totalAssets: read.totalAssets.toString(),
		openRedeemRequests: 0,
		deployment: {
			factory: null,
			block: read.firstBlock,
			timestamp: read.firstTimestamp,
		},
		usedBy: [],
	}
}

/**
 * Joins the two lists: drops ERC-4626 rows that are Earn vaults or their
 * engines, and records which Earn vaults deposit into each ERC-4626 vault.
 */
export function mergeVaults(
	earn: readonly Vault[],
	erc4626: readonly Vault[],
): Vault[] {
	const earnContracts = new Set<string>()
	const users = new Map<string, Hex40[]>()
	for (const vault of earn) {
		earnContracts.add(vault.address)
		if (vault.engineAddress) earnContracts.add(vault.engineAddress)
		if (vault.venue)
			users.set(vault.venue, [...(users.get(vault.venue) ?? []), vault.address])
	}
	return [
		...earn,
		...erc4626
			.filter((vault) => !earnContracts.has(vault.address))
			.map((vault) => ({ ...vault, usedBy: users.get(vault.address) ?? [] })),
	]
}

/** The vault address in an EarnStackDeployed log's first indexed topic. */
export function vaultFromTopic(topic: unknown): Hex40 | null {
	if (typeof topic !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(topic))
		return null
	return `0x${topic.slice(26).toLowerCase()}`
}

export const vaultSearchSchema = z.object({
	kind: z._default(z.enum(['all', ...vaultKinds]), 'all'),
	asset: z._default(z.string(), 'all'),
	dir: z._default(z.enum(['asc', 'desc']), 'desc'),
	unverified: z._default(z.boolean(), false),
})

export type VaultSearch = z.infer<typeof vaultSearchSchema>

export const defaultVaultSearch: VaultSearch = {
	kind: 'all',
	asset: 'all',
	dir: 'desc',
	unverified: false,
}

export function filterVaults(
	vaults: readonly Vault[],
	search: Partial<Pick<VaultSearch, 'kind' | 'asset' | 'unverified'>>,
): Vault[] {
	const { kind = 'all', asset = 'all', unverified = false } = search
	return vaults.filter(
		(vault) =>
			(unverified || (vault.verified && !isDust(vault))) &&
			(kind === 'all' || vault.kind === kind) &&
			(asset === 'all' || vault.asset.symbol === asset),
	)
}

/** A vault worth under $1 is left out of the default list. */
export function isDust(vault: Vault): boolean {
	return vault.tvl !== null && vault.tvl < 1
}

/** Sorted by TVL, unknown values last, then by address. */
export function sortVaults(
	vaults: readonly Vault[],
	dir: 'asc' | 'desc' = 'desc',
): Vault[] {
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
export function vaultAssets(vaults: readonly Vault[]): string[] {
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

/**
 * Whether a vault's value already sits in another listed vault: an Earn
 * vault whose venue is a listed ERC-4626 vault. Totals skip it so the same
 * money counts once.
 */
export function isNested(vault: Vault, listed: ReadonlySet<string>): boolean {
	return vault.venue !== null && listed.has(vault.venue)
}

export type VaultTotals = {
	/** Counting money that one vault deposits into another once. */
	tvl: number
	/** Vaults holding at least $1. */
	funded: number
	assets: number
}

export function vaultTotals(vaults: readonly Vault[]): VaultTotals {
	const listed = new Set(vaults.map((vault) => vault.address))
	let tvl = 0
	let funded = 0
	for (const vault of vaults) {
		if (vault.tvl === null) continue
		if (!isNested(vault, listed)) tvl += vault.tvl
		if (vault.tvl >= 1) funded += 1
	}
	return {
		tvl,
		funded,
		assets: new Set(vaults.map((v) => v.asset.symbol)).size,
	}
}

/** A vault's share of all vault TVL in the same asset, 0 to 1. */
export function assetShare(
	vault: Vault,
	vaults: readonly Vault[],
): number | null {
	if (vault.tvl === null) return null
	const same = vaults.filter(
		(other) => other.asset.symbol === vault.asset.symbol,
	)
	const total = vaultTotals(same).tvl
	return total > 0 ? Math.min(vault.tvl / total, 1) : null
}

export const vaultActivityKinds = ['deposit', 'withdrawal'] as const
export type VaultActivityKind = (typeof vaultActivityKinds)[number]

/** One deposit or withdrawal, by amount and time, never by who made it. */
export type VaultActivity = {
	id: string
	kind: VaultActivityKind
	/** Amount in the vault asset's base units. */
	assets: string
	transactionHash: `0x${string}`
	block: number
	log: number
	/** Unix seconds. */
	timestamp: number
}

export type VaultFlows = {
	/** Base units of the vault asset. */
	deposited: string
	withdrawn: string
	deposits: number
	withdrawals: number
}

export type VaultActivityResult = {
	activity: VaultActivity[]
	/** Over the last 30 days. */
	flows: VaultFlows
	/** Base units; null when the vault has no cap or reports none. */
	cap: string | null
}

/** Newest first: block, then log index. */
export function sortActivity(items: readonly VaultActivity[]): VaultActivity[] {
	return [...items].sort((a, b) => b.block - a.block || b.log - a.log)
}

/** A cap of 0 or uint256 max means the vault accepts any amount. */
export function capOrNull(value: bigint | null | undefined): string | null {
	if (value === null || value === undefined) return null
	if (value === 0n || value === 2n ** 256n - 1n) return null
	return value.toString()
}
