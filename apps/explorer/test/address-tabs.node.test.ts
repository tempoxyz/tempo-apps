import { describe, expect, it } from 'vitest'
import { addressTabSchema, resolveAddressTab } from '#lib/domain/address-tabs'

describe('address tab defaults', () => {
	it('defaults TIP-20 addresses to Token and other addresses to Transactions', () => {
		expect(addressTabSchema.parse(undefined)).toBeUndefined()
		expect(resolveAddressTab(undefined, true)).toBe('token')
		expect(resolveAddressTab(undefined, false)).toBe('transactions')
	})
	it.each([
		'transactions',
		'transfers',
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
