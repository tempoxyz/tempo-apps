import * as Address from 'ox/Address'
import { describe, expect, it } from 'vitest'
import {
	parseTip403PolicyId,
	parseTip403PolicyType,
	updateTip403Member,
} from '#lib/domain/tip403'

const account = Address.from('0x0000000000000000000000000000000000000001')

describe('TIP-403 policy helpers', () => {
	it('normalizes valid uint64 policy IDs and rejects invalid IDs', () => {
		expect(parseTip403PolicyId('0002')).toBe('2')
		expect(parseTip403PolicyId('18446744073709551615')).toBe(
			'18446744073709551615',
		)
		expect(parseTip403PolicyId('-1')).toBeUndefined()
		expect(parseTip403PolicyId('18446744073709551616')).toBeUndefined()
	})

	it('maps the registry policy enum, including compound policies', () => {
		expect(parseTip403PolicyType(0)).toBe('whitelist')
		expect(parseTip403PolicyType(1)).toBe('blacklist')
		expect(parseTip403PolicyType(2)).toBe('compound')
	})

	it('replays membership updates case-insensitively', () => {
		const members = new Map<string, typeof account>()
		updateTip403Member(members, account, true)
		updateTip403Member(members, account.toUpperCase() as typeof account, false)
		expect(members).toHaveLength(0)
	})
})
