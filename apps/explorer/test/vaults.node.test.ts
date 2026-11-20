import { describe, expect, it } from 'vitest'
import {
	type ApiEarnVault,
	assetShare,
	filterVaults,
	mergeVaults,
	sortActivity,
	sortVaults,
	toErc4626Vault,
	safeSymbol,
	toEarnVault,
	toVaultCap,
	type Vault,
	type VaultActivity,
	vaultAssets,
	vaultFromTopic,
	vaultTotals,
} from '#lib/vaults.ts'

const ousd = {
	address: '0x20c0000000000000000000006a37da5c996874be',
	symbol: 'OUSD',
	decimals: 6,
}
const venue = '0x0d136e26b4d9e4836fc5cb202baeb49cb6f5df48'
const engine = '0x1111111111111111111111111111111111111111'

const apiVault = (overrides: Partial<ApiEarnVault> = {}): ApiEarnVault => ({
	vaultAddress: '0x23D26636B00195204D25F85BB3FF692CD68DD7CE',
	verified: true,
	assetToken: ousd,
	engine: { type: 'erc4626', address: engine, venue },
	state: {
		depositsPaused: false,
		totalAssets: '21377297872219',
		openRedeemRequestCount: 0,
	},
	tvl: { formatted: '21377297.872219' },
	...overrides,
})

const earn = (overrides: Partial<Vault> = {}): Vault => ({
	...(toEarnVault(apiVault()) as Vault),
	...overrides,
})

const erc4626 = (overrides: Partial<Vault> = {}): Vault => ({
	...(toErc4626Vault({
		address: venue,
		asset: ousd.address,
		totalAssets: 47_292_700_915_392n,
		token: { symbol: 'OUSD', decimals: 6, currency: 'USD' },
		verifiedAsset: true,
		firstBlock: 5,
		firstTimestamp: 1_700_000_000,
	}) as Vault),
	...overrides,
})

describe('toEarnVault', () => {
	it('keeps the asset, engine, venue and TVL, lowercased', () => {
		expect(toEarnVault(apiVault())).toMatchObject({
			address: '0x23d26636b00195204d25f85bb3ff692cd68dd7ce',
			kind: 'earn',
			asset: ousd,
			engine: 'erc4626',
			engineAddress: engine,
			venue,
			tvl: 21377297.872219,
			usedBy: [],
		})
	})

	it('drops a vault without an asset or a valid address', () => {
		expect(toEarnVault(apiVault({ assetToken: null }))).toBeNull()
		expect(toEarnVault(apiVault({ vaultAddress: 'nope' }))).toBeNull()
	})

	it('never carries a share token name, owner, label or yield', () => {
		const json = JSON.stringify(
			toEarnVault({
				...apiVault(),
				label: 'Acme USD Vault',
				shareToken: { name: 'Acme Yield', symbol: 'acmeUSD' },
				apy: { net: '0.05' },
			} as ApiEarnVault),
		)
		expect(json).not.toMatch(/acme/i)
		expect(json).not.toContain('apy')
	})
})

describe('untrusted API values', () => {
	it('keeps unknown pause and redemption state unknown', () => {
		expect(toEarnVault(apiVault({ state: {} }))).toMatchObject({
			depositsPaused: null,
			openRedeemRequests: null,
		})
	})

	it('reads only plain decimals as numbers', () => {
		expect(toEarnVault(apiVault({ tvl: { formatted: ' ' } }))?.tvl).toBeNull()
		expect(
			toEarnVault(apiVault({ tvl: { formatted: '0x10' } }))?.tvl,
		).toBeNull()
	})

	it('rejects symbols that are not short printable strings', () => {
		expect(safeSymbol('OUSD')).toBe('OUSD')
		expect(safeSymbol(12)).toBeNull()
		expect(safeSymbol('1#__bigint')).toBeNull()
		expect(safeSymbol('x'.repeat(33))).toBeNull()
		expect(
			toEarnVault(apiVault({ assetToken: { ...ousd, symbol: { a: 1 } } })),
		).toBeNull()
	})

	it('lists a vault once when two reads return it', () => {
		expect(mergeVaults([earn(), earn()], [])).toHaveLength(1)
	})
})

describe('toErc4626Vault', () => {
	it('values a verified USD asset in dollars', () => {
		expect(erc4626()).toMatchObject({
			kind: 'erc4626',
			engine: null,
			verified: true,
			tvl: 47_292_700.915392,
			deployment: { factory: null, block: 5 },
		})
	})

	it('gives no dollar value to an unverified or non-USD asset', () => {
		const base = {
			address: venue,
			asset: ousd.address,
			totalAssets: 1_000_000n,
			firstBlock: 1,
			firstTimestamp: 1,
		}
		expect(
			toErc4626Vault({
				...base,
				token: { symbol: 'X', decimals: 6, currency: 'USD' },
				verifiedAsset: false,
			}),
		).toMatchObject({ verified: false, tvl: null })
		expect(
			toErc4626Vault({
				...base,
				token: { symbol: 'EURC', decimals: 6, currency: 'EUR' },
				verifiedAsset: true,
			}),
		).toMatchObject({ tvl: null })
	})

	it('drops empty vaults and unreadable assets', () => {
		const base = {
			address: venue,
			asset: ousd.address,
			verifiedAsset: true,
			firstBlock: 1,
			firstTimestamp: 1,
		}
		expect(
			toErc4626Vault({
				...base,
				totalAssets: 0n,
				token: { symbol: 'OUSD', decimals: 6, currency: 'USD' },
			}),
		).toBeNull()
		expect(toErc4626Vault({ ...base, totalAssets: 1n, token: null })).toBeNull()
	})
})

describe('mergeVaults', () => {
	it('drops Earn vaults and engines from the 4626 list and links venues', () => {
		const vault = earn()
		const merged = mergeVaults(
			[vault],
			[
				erc4626(),
				erc4626({ address: engine }),
				erc4626({ address: vault.address }),
			],
		)
		expect(merged.map((v) => [v.kind, v.address])).toEqual([
			['earn', vault.address],
			['erc4626', venue],
		])
		expect(merged[1]?.usedBy).toEqual([vault.address])
	})
})

describe('vault lists', () => {
	const big = earn({ address: '0x01', tvl: 1_000_000, venue: null })
	const small = erc4626({ address: '0x02', tvl: 1_000 })
	const unverified = erc4626({ address: '0x03', tvl: null, verified: false })
	const path = erc4626({
		address: '0x04',
		asset: {
			...ousd,
			address: '0x20c0000000000000000000000000000000000000',
			symbol: 'pathUSD',
		},
		tvl: 50,
	})

	it('filters by kind, asset and verification', () => {
		expect(filterVaults([big, small, unverified], {})).toEqual([big, small])
		expect(filterVaults([big, small], { kind: 'erc4626' })).toEqual([small])
		expect(filterVaults([big, unverified], { unverified: true })).toHaveLength(
			2,
		)
		expect(
			filterVaults([big, path], { asset: path.asset.address.toUpperCase() }),
		).toEqual([path])
		expect(filterVaults([big, path], { asset: '0xdead' })).toEqual([])
	})

	it('sorts by TVL with unknown values last', () => {
		expect(sortVaults([small, unverified, big])).toEqual([
			big,
			small,
			unverified,
		])
		expect(sortVaults([big, unverified, small], 'asc')).toEqual([
			small,
			big,
			unverified,
		])
	})

	it('lists assets by TVL', () => {
		expect(vaultAssets([path, small]).map((t) => t.symbol)).toEqual([
			'OUSD',
			'pathUSD',
		])
		const lookalike = erc4626({
			asset: { ...ousd, address: '0x2222222222222222222222222222222222222222' },
		})
		expect(vaultAssets([small, lookalike])).toHaveLength(2)
	})

	it('counts an Earn vault inside a listed venue once', () => {
		const nested = earn({ tvl: 20, venue })
		const outer = erc4626({ tvl: 100 })
		expect(vaultTotals([nested, outer])).toEqual({
			tvl: 100,
			funded: 2,
			assets: 1,
			unpriced: 0,
		})
		expect(
			vaultTotals([outer, erc4626({ address: '0x09', tvl: null })]).unpriced,
		).toBe(1)
		expect(vaultTotals([nested]).tvl).toBe(20)
		expect(assetShare(nested, [nested, outer])).toBe(0.2)
		expect(assetShare(outer, [nested, outer])).toBe(1)
	})
})

describe('vault activity', () => {
	const item = (block: number, log: number): VaultActivity => ({
		id: `0x${block}:${log}`,
		kind: 'deposit',
		assets: '1',
		transactionHash: `0x${'0'.repeat(64)}`,
		block,
		log,
		timestamp: block,
	})

	it('lists the newest first, by block then log index', () => {
		expect(
			sortActivity([item(1, 0), item(2, 1), item(2, 5)]).map((i) => i.id),
		).toEqual(['0x2:5', '0x2:1', '0x1:0'])
	})

	it('reads an unset or maximum cap as no cap, and a failed read as unknown', () => {
		expect(toVaultCap(0n)).toEqual({ status: 'uncapped' })
		expect(toVaultCap(2n ** 256n - 1n)).toEqual({ status: 'uncapped' })
		expect(toVaultCap(5_000_000n)).toEqual({
			status: 'capped',
			value: '5000000',
		})
		expect(toVaultCap(null)).toEqual({ status: 'unknown' })
	})

	it('reads the vault from an indexed topic', () => {
		expect(
			vaultFromTopic(
				'0x00000000000000000000000023d26636b00195204d25f85bb3ff692cd68dd7ce',
			),
		).toBe('0x23d26636b00195204d25f85bb3ff692cd68dd7ce')
		expect(vaultFromTopic('0x1234')).toBeNull()
	})
})
