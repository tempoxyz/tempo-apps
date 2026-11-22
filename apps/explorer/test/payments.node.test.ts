import { describe, expect, it } from 'vitest'
import {
	buildPaymentsDays,
	dayRange,
	type PaymentToken,
	paymentsTotals,
	units,
	weeklyTpv,
} from '#lib/payments.ts'

const usd: PaymentToken = {
	address: '0x20c0000000000000000000000000000000000000',
	symbol: 'pathUSD',
	price: 'USD',
	asset: 'stablecoin',
	tpv: true,
}
const eur: PaymentToken = {
	address: '0x20c0000000000000000000001621e21f71cf12fb',
	symbol: 'EURC.e',
	price: 'EUR',
	asset: 'stablecoin',
	tpv: true,
}
const fund: PaymentToken = {
	address: '0xb5ff12bd8010baef823d1bfa2ce6bdc0109cbb24',
	symbol: 'BUIDL',
	price: 'USD',
	asset: 'rwa',
	tpv: true,
}
const btc: PaymentToken = {
	address: '0x20c000000000000000000000c412ec89d0c08be5',
	symbol: 'cbBTC',
	price: 'bitcoin',
	asset: 'crypto',
	tpv: false,
}
const M = 1_000_000n

describe('units', () => {
	it('keeps cents on large amounts', () => {
		expect(units(12_345_678_250_000n)).toBe(12_345_678.25)
		expect(units(-1_500_000n)).toBe(-1.5)
	})
})

describe('dayRange', () => {
	it('spans months inclusively', () => {
		expect(dayRange('2026-10-30', '2026-11-02')).toEqual([
			'2026-10-30',
			'2026-10-31',
			'2026-11-01',
			'2026-11-02',
		])
	})
})

describe('buildPaymentsDays', () => {
	const rows = [
		{
			day: '2026-11-01',
			token: usd.address,
			minted: 100n * M,
			burned: 0n,
			moved: 40n * M,
		},
		{
			day: '2026-11-01',
			token: eur.address,
			minted: 10n * M,
			burned: 0n,
			moved: 10n * M,
		},
		{
			day: '2026-11-01',
			token: fund.address,
			minted: 50n * M,
			burned: 0n,
			moved: 5n * M,
		},
		{
			day: '2026-11-03',
			token: usd.address,
			minted: 0n,
			burned: 30n * M,
			moved: 20n * M,
		},
	]

	const btcRow = {
		day: '2026-11-02',
		token: btc.address,
		minted: 2n * M,
		burned: 0n,
		moved: M,
	}

	it('prices TPV, carries supply across quiet days and splits AOP by asset', () => {
		const days = buildPaymentsDays(
			[...rows, btcRow],
			[usd, eur, fund, btc],
			{ USD: 1, EUR: 1.1, bitcoin: 50 },
			'2026-11-04',
		)
		expect(days).toEqual([
			{
				day: '2026-11-01',
				tpv: 40 + 11 + 5,
				stablecoin: 111,
				rwa: 50,
				crypto: 0,
			},
			// Crypto held on Tempo is AOP, not payment volume.
			{ day: '2026-11-02', tpv: 0, stablecoin: 111, rwa: 50, crypto: 100 },
			{ day: '2026-11-03', tpv: 20, stablecoin: 81, rwa: 50, crypto: 100 },
			{ day: '2026-11-04', tpv: 0, stablecoin: 81, rwa: 50, crypto: 100 },
		])
	})

	it('leaves out an asset without a price', () => {
		const [first] = buildPaymentsDays(
			rows,
			[usd, eur, fund],
			{ USD: 1 },
			'2026-11-01',
		)
		expect(first).toEqual({
			day: '2026-11-01',
			tpv: 45,
			stablecoin: 100,
			rwa: 50,
			crypto: 0,
		})
	})

	it('ignores tokens outside the scope', () => {
		const days = buildPaymentsDays(
			[{ day: '2026-11-01', token: '0xdead', minted: M, burned: 0n, moved: M }],
			[usd],
			{ USD: 1 },
			'2026-11-01',
		)
		expect(days).toEqual([
			{ day: '2026-11-01', tpv: 0, stablecoin: 0, rwa: 0, crypto: 0 },
		])
	})
})

describe('paymentsTotals', () => {
	const days = dayRange('2026-11-01', '2026-11-10').map((day, i) => ({
		day,
		tpv: i + 1,
		stablecoin: 100 + i,
		rwa: 10,
		crypto: 1,
	}))

	it('counts full days for daily, weekly and AOP, and every day for lifetime', () => {
		expect(paymentsTotals(days, '2026-11-10')).toEqual({
			day: 9,
			week: 3 + 4 + 5 + 6 + 7 + 8 + 9,
			lifetime: 55,
			aop: 108 + 10 + 1,
			closed: '2026-11-09',
		})
	})
})

describe('weeklyTpv', () => {
	it('groups Monday-to-Sunday weeks', () => {
		const days = dayRange('2026-11-15', '2026-11-24').map((day) => ({
			day,
			tpv: 1,
			stablecoin: 0,
			rwa: 0,
			crypto: 0,
		}))
		expect(weeklyTpv(days)).toEqual([
			{ week: '2026-11-09', tpv: 1 },
			{ week: '2026-11-16', tpv: 7 },
			{ week: '2026-11-23', tpv: 2 },
		])
	})
})
