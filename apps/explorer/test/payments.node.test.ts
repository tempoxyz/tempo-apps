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
	currency: 'USD',
	aop: true,
}
const eur: PaymentToken = {
	address: '0x20c0000000000000000000001621e21f71cf12fb',
	symbol: 'EURC.e',
	currency: 'EUR',
	aop: true,
}
const fund: PaymentToken = {
	address: '0xb5ff12bd8010baef823d1bfa2ce6bdc0109cbb24',
	symbol: 'BUIDL',
	currency: 'USD',
	aop: false,
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

	it('prices TPV, carries supply across quiet days and leaves funds out of AOP', () => {
		const days = buildPaymentsDays(
			rows,
			[usd, eur, fund],
			{ USD: 1, EUR: 1.1 },
			'2026-11-04',
		)
		expect(days).toEqual([
			{ day: '2026-11-01', tpv: 40 + 11 + 5, aop: 100 + 11 },
			{ day: '2026-11-02', tpv: 0, aop: 111 },
			{ day: '2026-11-03', tpv: 20, aop: 81 },
			{ day: '2026-11-04', tpv: 0, aop: 81 },
		])
	})

	it('leaves out a currency without a rate', () => {
		const [first] = buildPaymentsDays(
			rows,
			[usd, eur, fund],
			{ USD: 1 },
			'2026-11-01',
		)
		expect(first).toEqual({ day: '2026-11-01', tpv: 45, aop: 100 })
	})

	it('ignores tokens outside the scope', () => {
		const days = buildPaymentsDays(
			[{ day: '2026-11-01', token: '0xdead', minted: M, burned: 0n, moved: M }],
			[usd],
			{ USD: 1 },
			'2026-11-01',
		)
		expect(days).toEqual([{ day: '2026-11-01', tpv: 0, aop: 0 }])
	})
})

describe('paymentsTotals', () => {
	const days = dayRange('2026-11-01', '2026-11-10').map((day, i) => ({
		day,
		tpv: i + 1,
		aop: 100 + i,
	}))

	it('counts full days for daily, weekly and AOP, and every day for lifetime', () => {
		expect(paymentsTotals(days, '2026-11-10')).toEqual({
			day: 9,
			week: 3 + 4 + 5 + 6 + 7 + 8 + 9,
			lifetime: 55,
			aop: 108,
			closed: '2026-11-09',
		})
	})
})

describe('weeklyTpv', () => {
	it('groups Monday-to-Sunday weeks', () => {
		const days = dayRange('2026-11-15', '2026-11-24').map((day) => ({
			day,
			tpv: 1,
			aop: 0,
		}))
		expect(weeklyTpv(days)).toEqual([
			{ week: '2026-11-09', tpv: 1 },
			{ week: '2026-11-16', tpv: 7 },
			{ week: '2026-11-23', tpv: 2 },
		])
	})
})
