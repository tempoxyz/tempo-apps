import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
	formatKeyExpiry,
	formatKeyPeriod,
	groupKeyScopes,
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
vi.mock('#comps/TokenIcon', () => ({ TokenIcon: () => null }))
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
	it('renders the reported budget, approval spender, unknown selector, and expiry', () => {
		const html = render()
		expect(html).toContain('1,000')
		expect(html).toContain('PathUSD')
		expect(html).toContain('Every 30 days')
		expect(html).toContain('approve(address,uint256)')
		expect(html).toContain('Only these spenders')
		expect(html).toContain(contract)
		expect(html).toContain('0xc50e660a')
		expect(html).toContain('Function selector')
		expect(html).toContain('Dec 15, 2026, 15:27:21 UTC')
		expect(html).toContain('Not current permissions or remaining balances')
	})

	it('distinguishes absent permissions from explicit deny-all arrays', () => {
		const unrestricted = render({
			limits: undefined,
			scopes: undefined,
			expiry: undefined,
		})
		expect(unrestricted).toContain('No token spending limits')
		expect(unrestricted).toContain('Any contract and function')
		expect(unrestricted).toContain('Never expires')
		const denied = render({ limits: [], scopes: [] })
		expect(denied).toContain('No token spending allowed')
		expect(denied).toContain('No calls allowed')
		expect(denied).not.toContain('Unrestricted calls')
	})

	it('keeps wildcard functions and unrestricted recipients explicit', () => {
		const html = render({ scopes: [{ address: contract }] })
		expect(html).toContain('Any function')
		expect(html).toContain('No recipient restriction')
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
