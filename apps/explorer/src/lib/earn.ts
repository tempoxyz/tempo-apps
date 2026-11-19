import * as z from 'zod/mini'

/**
 * Tempo Earn vaults, listed without naming who runs them: each row is the
 * vault's asset, engine kind and onchain numbers, never its share token's
 * name, owner or deployment ID, which can name a customer.
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

export type EarnVault = {
	address: `0x${string}`
	asset: EarnVaultToken
	engine: EarnEngine
	/** Registry-curated by Tempo. */
	verified: boolean
	depositsPaused: boolean
	/** Total assets in US dollars, or null when the asset has no USD rate. */
	tvl: number | null
	/** Net APY as a fraction (0.05 is 5%), or null before enough history. */
	apy: number | null
	/** The window `apy` is measured over, such as 7d. */
	apyWindow: string | null
	sharePrice: number | null
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
	engine?: { type?: string | null } | null
	state?: { depositsPaused?: boolean | null } | null
	tvl?: { formatted?: string | null } | null
	apy?: { net?: string | null; window?: string | null } | null
	sharePrice?: { formatted?: string | null } | null
}

function toNumber(value: string | null | undefined): number | null {
	if (value === null || value === undefined || value === '') return null
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

/** One API vault as a row, or null when it isn't a readable Earn vault. */
export function toEarnVault(vault: ApiEarnVault): EarnVault | null {
	const asset = vault.assetToken
	if (!vault.vaultAddress || !asset?.address || !asset.symbol) return null
	const type = vault.engine?.type
	return {
		address: vault.vaultAddress.toLowerCase() as `0x${string}`,
		asset: {
			address: asset.address.toLowerCase() as `0x${string}`,
			symbol: asset.symbol,
			decimals: asset.decimals,
		},
		engine: type === 'erc4626' || type === 'veda' ? type : 'other',
		verified: vault.verified === true,
		depositsPaused: vault.state?.depositsPaused === true,
		tvl: toNumber(vault.tvl?.formatted),
		apy: toNumber(vault.apy?.net),
		apyWindow: vault.apy?.window ?? null,
		sharePrice: toNumber(vault.sharePrice?.formatted),
	}
}

/** The vault address in an EarnStackDeployed log's first indexed topic. */
export function vaultFromTopic(topic: unknown): `0x${string}` | null {
	if (typeof topic !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(topic))
		return null
	return `0x${topic.slice(26).toLowerCase()}`
}

export const earnSorts = ['tvl', 'apy'] as const
export type EarnSort = (typeof earnSorts)[number]

export const earnSearchSchema = z.object({
	asset: z._default(z.string(), 'all'),
	sort: z._default(z.enum(earnSorts), 'tvl'),
	dir: z._default(z.enum(['asc', 'desc']), 'desc'),
	unverified: z._default(z.boolean(), false),
})

export type EarnSearch = z.infer<typeof earnSearchSchema>

export const defaultEarnSearch: EarnSearch = {
	asset: 'all',
	sort: 'tvl',
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

/** Sorted by the column, unknown values last, then by TVL and address. */
export function sortVaults(
	vaults: readonly EarnVault[],
	sort: EarnSort,
	dir: 'asc' | 'desc',
): EarnVault[] {
	const sign = dir === 'asc' ? 1 : -1
	return [...vaults].sort((a, b) => {
		const left = a[sort]
		const right = b[sort]
		if (left !== right) {
			if (left === null) return 1
			if (right === null) return -1
			return (left - right) * sign
		}
		const tvl = (b.tvl ?? -1) - (a.tvl ?? -1)
		if (tvl !== 0) return tvl
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
	/** Net APY weighted by TVL, over vaults with both. */
	apy: number | null
}

export function earnTotals(vaults: readonly EarnVault[]): EarnTotals {
	let tvl = 0
	let funded = 0
	let weighted = 0
	let weight = 0
	for (const vault of vaults) {
		if (vault.tvl === null) continue
		tvl += vault.tvl
		if (vault.tvl >= 1) funded += 1
		if (vault.apy !== null && vault.tvl > 0) {
			weighted += vault.apy * vault.tvl
			weight += vault.tvl
		}
	}
	return { tvl, funded, apy: weight > 0 ? weighted / weight : null }
}
