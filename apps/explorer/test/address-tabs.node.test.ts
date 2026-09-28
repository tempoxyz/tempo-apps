import { describe, expect, it } from 'vitest'
import {
	addressTabSchema,
	resolveAddressTab,
	resolveLegacyTokenTab,
} from '#lib/domain/address-tabs'

describe('address tab defaults', () => {
	it('defaults TIP-20 addresses to Token and other addresses to Transactions', () => {
		expect(addressTabSchema.parse(undefined)).toBeUndefined()
		expect(resolveAddressTab(undefined, true)).toBe('token')
		expect(resolveAddressTab(undefined, false)).toBe('transactions')
	})
	it.each([
		'transactions',
		'transfers',
		'fees',
		'holders',
		'token',
		'contract',
		'interact',
	] as const)('preserves explicit %s links', (tab) => {
		expect(resolveAddressTab(addressTabSchema.parse(tab), true)).toBe(tab)
	})
	it('preserves legacy links and the invalid-tab fallback', () => {
		expect(resolveAddressTab(addressTabSchema.parse('history'), true)).toBe(
			'transactions',
		)
		expect(resolveAddressTab(addressTabSchema.parse('assets'), true)).toBe(
			'holdings',
		)
		expect(resolveAddressTab(addressTabSchema.parse('unknown'), true)).toBe(
			'transactions',
		)
	})
})

describe('legacy token redirects', () => {
	it('opens TIP-20 search results on Token', () => {
		expect(resolveLegacyTokenTab(undefined, true)).toBe('token')
		expect(resolveLegacyTokenTab(undefined, false)).toBe('transfers')
	})
	it('preserves account-filtered transfer drill-downs', () => {
		expect(
			resolveLegacyTokenTab(
				undefined,
				true,
				'0x00000000000000000000000000000000000000ab',
			),
		).toBe('transfers')
	})
	it.each([
		['transfers', 'transfers'],
		['holders', 'holders'],
		['token', 'token'],
		['contract', 'contract'],
		['interact', 'contract'],
		['unknown', 'transfers'],
	])('preserves the %s redirect', (tab, expected) => {
		expect(resolveLegacyTokenTab(tab, true)).toBe(expected)
	})
})
