import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
	formatKeyExpiry,
	formatKeyPeriod,
	groupKeyScopes,
	withKeyAuthorizationDescription,
	type KeyAuthorization,
} from '#lib/domain/access-key'
import { TxKeyAuthorization } from '#comps/TxKeyAuthorization'

const { metadata } = vi.hoisted(() => ({
	metadata: {
		current: { symbol: 'PathUSD', decimals: 6 } as
			| { symbol: string; decimals: number }
			| undefined,
	},
}))
vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		params,
	}: {
		children: React.ReactNode
		params: { address: string }
	}) => createElement('a', { href: `/address/${params.address}` }, children),
}))
vi.mock('wagmi/tempo', () => ({
	Hooks: { token: { useGetMetadata: () => ({ data: metadata.current }) } },
}))
vi.mock('#lib/queries', () => ({ useAutoloadAbi: () => ({ data: undefined }) }))
vi.mock('#lib/domain/tip20', () => ({
	isTip20Address: (address: string) => address.startsWith('0x20c'),
}))

const token = '0x20c0000000000000000000000000000000000000'
const contract = '0x157a8a5695f82c62a9fdb7cb71aab3430ae814d8'
// Authorization from the reported Moderato transaction, after SDK formatting.
const authorization: KeyAuthorization = {
	address: '0xb629d023e469f5f172359d96d54906d24643868f',
	chainId: 42431n,
	type: 'secp256k1',
	expiry: 0x6b215c59,
	limits: [{ token, limit: 1_000_000_000n, period: 2_592_000 }],
	scopes: [
		{ address: token, selector: '0x095ea7b3', recipients: [contract] },
		{ address: contract, selector: '0xc50e660a' },
	],
	signature: { type: 'secp256k1', r: 1n, s: 1n, yParity: 0 },
}

function render(overrides: Partial<KeyAuthorization> = {}) {
	return renderToStaticMarkup(
		createElement(TxKeyAuthorization, {
			authorization: { ...authorization, ...overrides } as KeyAuthorization,
		}),
	)
}

describe('access key permissions', () => {
	it('uses labelled detail rows without repeating the event identity or a status badge', () => {
		const html = render()
		for (const label of [
			'Expires',
			'Key management',
			'Spend limits',
			'Allowed calls',
		])
			expect(html).toMatch(new RegExp(`<dt[^>]*>${label}</dt>`))
		expect(html).not.toContain(authorization.address)
		expect(html).not.toContain('Scoped calls')
		expect(html).not.toContain('<h3')
		expect(html).not.toContain('Other tokens have no spending allowance')
		expect(html).not.toContain('Only these contracts and functions are allowed')
	})

	it('includes authorization before indexed descriptions without requiring a log', () => {
		const account = '0xb9ba2b8382f1a712c31fbfcf1a692c01639bf43c'
		const activity = { type: 'send', parts: [] }
		const result = withKeyAuthorizationDescription(
			[activity],
			account,
			authorization,
		)
		expect(result.events).toEqual([result.authorizationEvent, activity])
		expect(result.authorizationEvent?.parts).toContainEqual({
			type: 'account',
			value: authorization.address,
		})
	})

	it('deduplicates only the matching account and key and preserves ordinary transactions', () => {
		const account = '0xb9ba2b8382f1a712c31fbfcf1a692c01639bf43c'
		const event = withKeyAuthorizationDescription([], account, authorization)
			.events[0]
		const otherKey = withKeyAuthorizationDescription([], account, {
			...authorization,
			address: contract,
		}).events[0]
		const otherAccount = withKeyAuthorizationDescription(
			[],
			contract,
			authorization,
		).events[0]
		const events = [event, otherKey, otherAccount]
		const result = withKeyAuthorizationDescription(
			events,
			account,
			authorization,
		)
		expect(result.events).toEqual([
			result.authorizationEvent,
			otherKey,
			otherAccount,
		])
		expect(withKeyAuthorizationDescription(events, account, null)).toEqual({
			events,
			authorizationEvent: undefined,
		})
		expect(events).toEqual([event, otherKey, otherAccount])
	})

	it('starts collapsed with an accessible disclosure and does not load permission contents', () => {
		const html = renderToStaticMarkup(
			createElement(TxKeyAuthorization.Disclosure, { authorization }),
		)
		expect(html).toContain('Show permissions')
		expect(html).toContain('aria-expanded="false"')
		expect(html).toContain('aria-controls=')
		expect(html).not.toContain('Spend limits')
	})

	it('renders the reported budget, approval spender, unknown selector, and expiry', () => {
		const html = render()
		expect(html).toContain('1,000')
		expect(html).toContain('PathUSD')
		expect(html).toContain('Every 30 days')
		expect(html).toContain('approve(address,uint256)')
		expect(html).toContain('Spenders')
		expect(html).toContain(contract)
		expect(html).toContain('0xc50e660a')
		expect(html).toContain('Dec 15, 2026, 15:27:21 UTC')
		expect(html).not.toContain('No recipient restriction')
		expect(html).not.toContain('Any recipient')
	})

	it('distinguishes absent permissions from explicit deny-all arrays', () => {
		const unrestricted = render({
			limits: undefined,
			scopes: undefined,
			expiry: undefined,
		})
		expect(unrestricted).toContain('Unrestricted')
		expect(unrestricted).toContain('Any contract and function')
		expect(unrestricted).toContain('Never expires')
		const denied = render({ limits: [], scopes: [] })
		expect(denied).toContain('No spending allowed')
		expect(denied).toContain('No calls allowed')
		expect(denied).not.toContain('Unrestricted')
	})

	it('keeps wildcard functions explicit without suggesting recipient scoping', () => {
		const html = render({ scopes: [{ address: contract }] })
		expect(html).toContain('Any function')
		expect(html).not.toMatch(/recipient|spender/)
	})

	it.each([
		['0xa9059cbb', 'recipient'],
		['0x95777d59', 'recipient'],
		['0x095ea7b3', 'spender'],
	])('shows the applicable address scope for TIP-20 selector %s', (selector, label) => {
		for (const recipients of [undefined, []]) {
			const html = render({
				scopes: [{ address: token, selector, recipients }],
			})
			expect(html).toContain(`Any ${label}`)
			expect(html).not.toContain(
				label === 'spender' ? 'Spenders' : 'Recipients',
			)
		}
		const restricted = render({
			scopes: [{ address: token, selector, recipients: [contract] }],
		})
		expect(restricted).toContain(
			label === 'spender' ? 'Spenders' : 'Recipients',
		)
		expect(restricted).toContain(`href="/address/${contract}"`)
		expect(restricted).not.toContain(`Any ${label}`)
	})

	it.each([
		{ address: contract, selector: '0xc50e660a' },
		{ address: token, selector: '0xc50e660a' },
		{ address: token, selector: '0x23b872dd' },
		{ address: token },
		...['0xa9059cbb', '0x95777d59', '0x095ea7b3'].map((selector) => ({
			address: contract,
			selector,
		})),
	])('omits recipient details for unsupported scope $address/$selector', (scope) => {
		const html = render({ scopes: [scope] })
		expect(html).not.toMatch(/recipient|spender/)
	})

	it('displays zero, small allowances, and exact base units when metadata is unavailable', () => {
		expect(render({ limits: [{ token, limit: 0n }] })).toContain('>0</span>')
		expect(render({ limits: [{ token, limit: 1n }] })).toContain('0.000001')
		metadata.current = undefined
		try {
			const html = render()
			expect(html).toContain('1,000,000,000')
			expect(html).toContain('base units')
			expect(html).not.toContain('PathUSD')
		} finally {
			metadata.current = { symbol: 'PathUSD', decimals: 6 }
		}
	})

	it('shows admin privileges when present', () => {
		expect(render({ isAdmin: true, account: contract })).toContain(
			'Admin access',
		)
		expect(render()).toContain('No admin access')
	})

	it('groups functions by target without losing recipient restrictions', () => {
		const scopes = [
			...(authorization.scopes ?? []),
			{ address: token, selector: '0xa9059cbb', recipients: [contract] },
		]
		const targets = groupKeyScopes(scopes)
		expect(targets).toHaveLength(2)
		expect(targets?.[0]?.rules).toHaveLength(2)
		expect(targets?.[0]?.rules[0]?.recipients).toEqual([contract])
		expect(groupKeyScopes(undefined)).toBeUndefined()
		expect(groupKeyScopes([])).toEqual([])
	})

	it('keeps one-time limits distinct from fixed reset intervals', () => {
		expect(formatKeyPeriod(undefined)).toBe('One-time allowance')
		expect(formatKeyPeriod(0)).toBe('One-time allowance')
		expect(formatKeyPeriod(86400)).toBe('Every 1 day')
		expect(formatKeyPeriod(3600)).toBe('Every 1 hour')
		expect(formatKeyPeriod(90)).toBe('Every 90 seconds')
		expect(formatKeyExpiry(0)).not.toBe('Never expires')
		expect(formatKeyExpiry(Number(2n ** 64n - 1n))).toContain('Unix timestamp')
	})
})
