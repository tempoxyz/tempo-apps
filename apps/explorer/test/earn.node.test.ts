import { describe, expect, it } from 'vitest'
import {
	type ApiEarnVault,
	type EarnVault,
	earnTotals,
	filterVaults,
	sortVaults,
	toEarnVault,
	vaultAssets,
	vaultFromTopic,
} from '#lib/earn.ts'

const ousd = {
	address: '0x20c0000000000000000000006a37da5c996874be',
	symbol: 'OUSD',
	decimals: 6,
}

const apiVault = (overrides: Partial<ApiEarnVault> = {}): ApiEarnVault => ({
	vaultAddress: '0x23D26636B00195204D25F85BB3FF692CD68DD7CE',
	verified: true,
	assetToken: ousd,
	engine: { type: 'erc4626' },
	state: { depositsPaused: false },
	tvl: { formatted: '21377297.872219' },
	apy: { net: '0.051270', window: '7d' },
	sharePrice: { formatted: '1.004677' },
	...overrides,
})

const vault = (overrides: Partial<EarnVault> = {}): EarnVault => ({
	...(toEarnVault(apiVault()) as EarnVault),
	...overrides,
})

describe('toEarnVault', () => {
	it('keeps the asset, engine and numbers, lowercased', () => {
		expect(toEarnVault(apiVault())).toEqual({
			address: '0x23d26636b00195204d25f85bb3ff692cd68dd7ce',
			asset: ousd,
			engine: 'erc4626',
			verified: true,
			depositsPaused: false,
			tvl: 21377297.872219,
			apy: 0.05127,
			apyWindow: '7d',
			sharePrice: 1.004677,
		})
	})

	it('reads missing numbers as unknown and unknown engines as other', () => {
		const row = toEarnVault(
			apiVault({
				engine: { type: null },
				tvl: null,
				apy: null,
				sharePrice: null,
			}),
		)
		expect(row).toMatchObject({
			engine: 'other',
			tvl: null,
			apy: null,
			sharePrice: null,
		})
	})

	it('drops a vault without an asset', () => {
		expect(toEarnVault(apiVault({ assetToken: null }))).toBeNull()
	})

	it('never carries a share token name, owner or label', () => {
		const row = toEarnVault({
			...apiVault(),
			label: 'Acme USD Vault',
			shareToken: { name: 'Acme Yield' },
		} as ApiEarnVault)
		expect(JSON.stringify(row)).not.toContain('Acme')
	})
})

describe('vaultFromTopic', () => {
	it('reads the address from an indexed topic', () => {
		expect(
			vaultFromTopic(
				'0x00000000000000000000000023d26636b00195204d25f85bb3ff692cd68dd7ce',
			),
		).toBe('0x23d26636b00195204d25f85bb3ff692cd68dd7ce')
		expect(vaultFromTopic('0x1234')).toBeNull()
		expect(vaultFromTopic(null)).toBeNull()
	})
})

describe('vault lists', () => {
	const big = vault({ address: '0x01', tvl: 1_000_000, apy: 0.05 })
	const small = vault({ address: '0x02', tvl: 1_000, apy: 0.1 })
	const empty = vault({ address: '0x03', tvl: 0, apy: null, verified: false })
	const path = vault({
		address: '0x04',
		asset: {
			...ousd,
			address: '0x20c0000000000000000000000000000000000000',
			symbol: 'pathUSD',
		},
		tvl: 50,
		apy: 0,
	})

	it('hides unverified vaults unless asked, and filters by asset', () => {
		expect(
			filterVaults([big, empty], { asset: 'all', unverified: false }),
		).toEqual([big])
		expect(
			filterVaults([big, empty], { asset: 'all', unverified: true }),
		).toHaveLength(2)
		expect(
			filterVaults([big, path], { asset: 'pathUSD', unverified: false }),
		).toEqual([path])
	})

	it('sorts by the column with unknown values last', () => {
		expect(sortVaults([small, big], 'tvl', 'desc')).toEqual([big, small])
		expect(sortVaults([big, empty, small], 'apy', 'desc')).toEqual([
			small,
			big,
			empty,
		])
		expect(sortVaults([big, empty, small], 'apy', 'asc')).toEqual([
			big,
			small,
			empty,
		])
	})

	it('lists assets by TVL', () => {
		expect(vaultAssets([path, small])).toEqual(['OUSD', 'pathUSD'])
	})

	it('totals TVL, funded vaults and TVL-weighted APY', () => {
		const totals = earnTotals([big, small, empty])
		expect(totals.tvl).toBe(1_001_000)
		expect(totals.funded).toBe(2)
		expect(totals.apy).toBeCloseTo((1_000_000 * 0.05 + 1_000 * 0.1) / 1_001_000)
		expect(earnTotals([]).apy).toBeNull()
	})
})
