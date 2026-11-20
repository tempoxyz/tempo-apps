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
	 * Earn: in Tempo's curated registry. ERC-4626: a verified Earn vault
	 * deposits into it. Anyone can deploy a contract that claims to be an
	 * ERC-4626 vault, so only these count toward totals.
	 */
	verified: boolean
	/** Null when the vault doesn't report it. */
	depositsPaused: boolean | null
	/** Total assets in US dollars, or null when the asset has no USD rate. */
	tvl: number | null
	/** Total assets in the asset's base units. */
	totalAssets: string | null
	/** Null when the vault doesn't report it. */
	openRedeemRequests: number | null
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
	assetToken?: { address: string; symbol: unknown; decimals: unknown } | null
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

const decimal = /^-?\d+(\.\d+)?$/

/** A plain decimal string as a number; anything else is unknown. */
function toNumber(value: unknown): number | null {
	if (typeof value !== 'string' || !decimal.test(value)) return null
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

/**
 * A token symbol safe to show and to cache: control characters removed and
 * cut to 32 characters. Only an empty symbol, or one ending in the cache
 * codec's type marker (such as #__bigint), is rejected; any real symbol,
 * including Unicode ones like USD₮0, passes.
 */
export function safeSymbol(value: unknown): string | null {
	if (typeof value !== 'string') return null
	// biome-ignore lint/suspicious/noControlCharactersInRegex: strips them
	const symbol = [...value.replace(/[\u0000-\u001f\u007f]/g, '').trim()]
		.slice(0, 32)
		.join('')
	if (symbol === '' || /#__[a-z]+$/i.test(symbol)) return null
	return symbol
}

function safeDecimals(value: unknown): number | null {
	return typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 0 &&
		value <= 36
		? value
		: null
}

/** One Earn API vault as a row, or null when it isn't a readable vault. */
export function toEarnVault(
	vault: ApiEarnVault,
	deployment: VaultDeployment | null = null,
): Vault | null {
	const asset = vault.assetToken
	const address = addressOrNull(vault.vaultAddress)
	const assetAddress = addressOrNull(asset?.address)
	const symbol = safeSymbol(asset?.symbol)
	const decimals = safeDecimals(asset?.decimals)
	if (!address || !assetAddress || symbol === null || decimals === null)
		return null
	const type = vault.engine?.type
	const totalAssets = vault.state?.totalAssets
	const paused = vault.state?.depositsPaused
	const redemptions = vault.state?.openRedeemRequestCount
	return {
		address,
		kind: 'earn',
		asset: { address: assetAddress, symbol, decimals },
		engine: type === 'erc4626' || type === 'veda' ? type : 'other',
		engineAddress: addressOrNull(vault.engine?.address),
		venue: addressOrNull(vault.engine?.venue),
		verified: vault.verified === true,
		depositsPaused: typeof paused === 'boolean' ? paused : null,
		tvl: toNumber(vault.tvl?.formatted),
		totalAssets:
			typeof totalAssets === 'string' && digits.test(totalAssets)
				? totalAssets
				: null,
		openRedeemRequests:
			typeof redemptions === 'number' && Number.isInteger(redemptions)
				? redemptions
				: null,
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
	const symbol = safeSymbol(read.token?.symbol)
	const decimals = safeDecimals(read.token?.decimals)
	if (!address || !asset || symbol === null || decimals === null) return null
	if (read.totalAssets <= 0n) return null
	const currency = read.token?.currency ?? null
	const units = Number(read.totalAssets) / 10 ** decimals
	return {
		address,
		kind: 'erc4626',
		asset: { address: asset, symbol, decimals },
		engine: null,
		engineAddress: null,
		venue: null,
		verified: false,
		depositsPaused: null,
		tvl: read.verifiedAsset && currency === 'USD' ? units : null,
		totalAssets: read.totalAssets.toString(),
		openRedeemRequests: null,
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
	const unique = (list: readonly Vault[]) => [
		...new Map(list.map((vault) => [vault.address, vault])).values(),
	]
	earn = unique(earn)
	erc4626 = unique(erc4626)
	for (const vault of earn) {
		earnContracts.add(vault.address)
		if (vault.engineAddress) earnContracts.add(vault.engineAddress)
		if (vault.venue)
			users.set(vault.venue, [...(users.get(vault.venue) ?? []), vault.address])
	}
	const verifiedUsers = new Set(
		earn.flatMap((vault) =>
			vault.verified && vault.venue ? [vault.venue] : [],
		),
	)
	return [
		...earn,
		...erc4626
			.filter((vault) => !earnContracts.has(vault.address))
			.map((vault) => ({
				...vault,
				verified: verifiedUsers.has(vault.address),
				usedBy: users.get(vault.address) ?? [],
			})),
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
	/** An asset's token address, or all. */
	asset: z._default(z.catch(z.string(), 'all'), 'all'),
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
			(asset === 'all' || vault.asset.address === asset.toLowerCase()),
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

/** Assets with at least one vault, by token address, the largest by TVL first. */
export function vaultAssets(vaults: readonly Vault[]): VaultToken[] {
	const assets = new Map<string, { token: VaultToken; tvl: number }>()
	for (const vault of vaults) {
		const entry = assets.get(vault.asset.address)
		assets.set(vault.asset.address, {
			token: entry?.token ?? vault.asset,
			tvl: (entry?.tvl ?? 0) + (vault.tvl ?? 0),
		})
	}
	return [...assets.values()]
		.sort(
			(a, b) => b.tvl - a.tvl || a.token.address.localeCompare(b.token.address),
		)
		.map((entry) => entry.token)
}

/**
 * Whether a vault's value already sits in another listed vault: an Earn
 * vault whose venue is a listed ERC-4626 vault. Totals skip it so the same
 * money counts once.
 */
export function isNested(vault: Vault, priced: ReadonlySet<string>): boolean {
	return vault.venue !== null && priced.has(vault.venue)
}

export type VaultTotals = {
	/**
	 * Verified vaults only, counting money one vault deposits into another
	 * once. An unverified vault's TVL is whatever its contract reports.
	 */
	tvl: number
	/** Verified vaults holding at least $1. */
	funded: number
	assets: number
	/** Verified vaults with no USD value, left out of tvl and funded. */
	unpriced: number
}

export function vaultTotals(vaults: readonly Vault[]): VaultTotals {
	// Only a verified venue with a USD value already counts an Earn vault's
	// money; otherwise the Earn vault is counted itself.
	const priced = new Set(
		vaults.flatMap((vault) =>
			vault.verified && vault.tvl !== null ? [vault.address] : [],
		),
	)
	let tvl = 0
	let funded = 0
	let unpriced = 0
	for (const vault of vaults) {
		if (!vault.verified) continue
		if (vault.tvl === null) {
			unpriced += 1
			continue
		}
		if (!isNested(vault, priced)) tvl += vault.tvl
		if (vault.tvl >= 1) funded += 1
	}
	return {
		tvl,
		funded,
		assets: new Set(
			vaults.flatMap((v) => (v.verified ? [v.asset.address] : [])),
		).size,
		unpriced,
	}
}

/** A vault's share of all vault TVL in the same asset, 0 to 1. */
export function assetShare(
	vault: Vault,
	vaults: readonly Vault[],
): number | null {
	// The total covers verified vaults only, so only they have a share of it.
	if (vault.tvl === null || !vault.verified) return null
	const same = vaults.filter(
		(other) => other.asset.address === vault.asset.address,
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
	cap: VaultCap
}

/** A deposit cap read onchain, kept apart from a read that failed. */
export type VaultCap =
	| { status: 'capped'; value: string }
	| { status: 'uncapped' }
	| { status: 'unknown' }

/** Newest first: block, then log index. */
export function sortActivity(items: readonly VaultActivity[]): VaultActivity[] {
	return [...items].sort((a, b) => b.block - a.block || b.log - a.log)
}

/** A cap of 0 or uint256 max means the vault accepts any amount. */
export function toVaultCap(value: bigint | null | undefined): VaultCap {
	if (value === null || value === undefined) return { status: 'unknown' }
	if (value === 0n || value === 2n ** 256n - 1n) return { status: 'uncapped' }
	return { status: 'capped', value: value.toString() }
}
