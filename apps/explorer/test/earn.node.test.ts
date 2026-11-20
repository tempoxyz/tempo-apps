import { describe, expect, it } from 'vitest'
import {
	type ApiEarnVault,
	assetShare,
	capOrNull,
	type EarnActivity,
	type EarnVault,
	earnTotals,
	filterVaults,
	sortActivity,
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
	engine: {
		type: 'erc4626',
		address: '0x1111111111111111111111111111111111111111',
		venue: null,
	},
	state: {
		depositsPaused: false,
		totalAssets: '21377297872219',
		openRedeemRequestCount: 0,
	},
	tvl: { formatted: '21377297.872219' },
	...overrides,
})

const vault = (overrides: Partial<EarnVault> = {}): EarnVault => ({
	...(toEarnVault(apiVault()) as EarnVault),
	...overrides,
})

describe('toEarnVault', () => {
	it('keeps the asset, engine and TVL, lowercased', () => {
		const deployment = {
			factory: '0x3085a8003f340cd51c72d9e1a1298cdafb171b02',
			block: 10,
			timestamp: 1_700_000_000,
		} as const
		expect(toEarnVault(apiVault(), deployment)).toEqual({
			address: '0x23d26636b00195204d25f85bb3ff692cd68dd7ce',
			asset: ousd,
			engine: 'erc4626',
			engineAddress: '0x1111111111111111111111111111111111111111',
			venue: null,
			verified: true,
			depositsPaused: false,
			tvl: 21377297.872219,
			totalAssets: '21377297872219',
			openRedeemRequests: 0,
			deployment,
		})
	})

	it('reads missing numbers as unknown and unknown engines as other', () => {
		const row = toEarnVault(
			apiVault({ engine: { type: null }, tvl: null, state: null }),
		)
		expect(row).toMatchObject({
			engine: 'other',
			engineAddress: null,
			tvl: null,
			totalAssets: null,
		})
	})

	it('drops a vault without an asset or a valid address', () => {
		expect(toEarnVault(apiVault({ assetToken: null }))).toBeNull()
		expect(toEarnVault(apiVault({ vaultAddress: 'nope' }))).toBeNull()
	})

	it('never carries a share token name, owner, label or yield', () => {
		const row = toEarnVault({
			...apiVault(),
			label: 'Acme USD Vault',
			shareToken: { name: 'Acme Yield', symbol: 'acmeUSD' },
			apy: { net: '0.05' },
		} as ApiEarnVault)
		const json = JSON.stringify(row)
		expect(json).not.toMatch(/acme/i)
		expect(json).not.toContain('apy')
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
	const big = vault({ address: '0x01', tvl: 1_000_000 })
	const small = vault({ address: '0x02', tvl: 1_000 })
	const empty = vault({ address: '0x03', tvl: null, verified: false })
	const path = vault({
		address: '0x04',
		asset: {
			...ousd,
			address: '0x20c0000000000000000000000000000000000000',
			symbol: 'pathUSD',
		},
		tvl: 50,
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

	it('sorts by TVL with unknown values last', () => {
		expect(sortVaults([small, empty, big])).toEqual([big, small, empty])
		expect(sortVaults([big, empty, small], 'asc')).toEqual([small, big, empty])
	})

	it('lists assets by TVL', () => {
		expect(vaultAssets([path, small])).toEqual(['OUSD', 'pathUSD'])
	})

	it('totals TVL, funded vaults and assets', () => {
		expect(earnTotals([big, small, empty, path])).toEqual({
			tvl: 1_001_050,
			funded: 3,
			assets: 2,
		})
	})

	it('gives a vault its share of TVL in the same asset', () => {
		expect(assetShare(big, [big, small, path])).toBeCloseTo(
			1_000_000 / 1_001_000,
		)
		expect(assetShare(path, [big, path])).toBe(1)
		expect(assetShare(empty, [big, empty])).toBeNull()
	})
})

describe('vault activity', () => {
	const item = (block: number, log: number): EarnActivity => ({
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

	it('reads an unset or maximum cap as no cap', () => {
		expect(capOrNull(0n)).toBeNull()
		expect(capOrNull(2n ** 256n - 1n)).toBeNull()
		expect(capOrNull(null)).toBeNull()
		expect(capOrNull(5_000_000n)).toBe('5000000')
	})
})
