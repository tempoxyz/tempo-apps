import { defaultParseSearch, isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { accountFilterSearchSchema } from '#lib/domain/account-filter'
import { Route } from '#routes/_layout/token/$address'

const address = '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432'
const account = '0x0000000000000000000000000000000000000000'
const schema = Route.options.validateSearch

function redirectFor(query: string, token = address) {
	const beforeLoad = Route.options.beforeLoad
	if (!beforeLoad) throw new Error('Missing legacy token redirect')
	const search = schema.parse(defaultParseSearch(query))
	try {
		beforeLoad({ params: { address: token }, search } as Parameters<
			typeof beforeLoad
		>[0])
	} catch (error) {
		if (!isRedirect(error)) throw error
		return error.options
	}
	throw new Error('Expected the legacy token route to redirect')
}

describe('optional account filter search values', () => {
	it.each([
		'444',
		'505',
		'527',
		'622',
	])('normalizes the GSC a=%s URL without failing validation', (value) => {
		const parsed = defaultParseSearch(`?a=${value}`)
		expect(parsed.a).toBe(Number(value))
		expect(accountFilterSearchSchema.parse(parsed.a)).toBeUndefined()
		expect(redirectFor(`?a=${value}`)).toMatchObject({
			to: '/address/$address',
			params: { address },
			search: { tab: 'transfers' },
		})
		expect(redirectFor(`?a=${value}`).search).not.toHaveProperty('a')
	})

	it.each([
		'true',
		'false',
		'null',
		'[]',
		'{}',
		'[444]',
		'a&a=444',
	])('ignores a non-string account filter %s', (value) => {
		expect(
			accountFilterSearchSchema.parse(defaultParseSearch(`?a=${value}`).a),
		).toBeUndefined()
	})

	it('preserves valid address filters and numeric pagination', () => {
		expect(
			redirectFor(`?page=2&a=${account}&limit=10&tab=holders`).search,
		).toEqual({
			tab: 'holders',
			page: 2,
			limit: 10,
			a: account,
		})
	})

	it('does not change string filters or coerce unrelated fields', () => {
		expect(accountFilterSearchSchema.parse(account)).toBe(account)
		expect(accountFilterSearchSchema.parse('')).toBe('')
		expect(accountFilterSearchSchema.parse('not-an-address')).toBe(
			'not-an-address',
		)
		expect(schema.safeParse(defaultParseSearch('?page=invalid')).success).toBe(
			false,
		)
		expect(schema.safeParse(defaultParseSearch('?limit=invalid')).success).toBe(
			false,
		)
	})

	it('preserves absent filters and TIP-20 defaults', () => {
		const tip20 = '0x20c0000000000000000000000000000000000000'
		expect(accountFilterSearchSchema.parse(undefined)).toBeUndefined()
		expect(redirectFor('', tip20).search).toEqual({ tab: 'token' })
		expect(redirectFor('?a=444', tip20).search).toEqual({ tab: 'token' })
		expect(redirectFor(`?a=${account}`, tip20).search).toEqual({
			tab: 'transfers',
			a: account,
		})
	})
})
