import { describe, expect, it } from 'vitest'
import { resolveName, withNameOverride } from '#lib/domain/tip20'

const ousd = '0x20c0000000000000000000006a37DA5C996874BE'
const pathUsd = '0x20c0000000000000000000000000000000000000'

describe('TIP-20 name overrides', () => {
	it('replaces the onchain OUSD name for any address casing', () => {
		expect(resolveName(ousd, 'OpenUSD')).toBe('Open USD')
		expect(resolveName(ousd.toLowerCase(), 'OpenUSD')).toBe('Open USD')
		expect(withNameOverride(ousd, { name: 'OpenUSD', symbol: 'OUSD' })).toEqual(
			{ name: 'Open USD', symbol: 'OUSD' },
		)
	})

	it('keeps onchain names for tokens without an override', () => {
		const metadata = { name: 'pathUSD', symbol: 'pathUSD' }
		expect(resolveName(pathUsd, 'pathUSD')).toBe('pathUSD')
		expect(withNameOverride(pathUsd, metadata)).toBe(metadata)
	})
})
