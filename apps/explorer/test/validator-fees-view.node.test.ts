import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidatorFees } from '#comps/ValidatorFees'

const { query, section } = vi.hoisted(() => ({
	query: vi.fn(),
	section: { mode: 'tabs' },
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: query }))
vi.mock('#lib/hooks', () => ({ useIsMounted: () => true }))
vi.mock('#comps/TokenListMembership', () => ({
	useTokenListMembership: () => ({ isTokenListed: () => true }),
}))
vi.mock('#wagmi.config', () => ({ getTempoChain: () => ({ id: 4217 }) }))
vi.mock('#lib/queries/validator-fees', () => ({
	validatorFeesQueryOptions: () => ({}),
}))
vi.mock('#comps/Sections', () => ({
	Sections: { useSectionsMode: () => section.mode },
}))
vi.mock('@tanstack/react-router', () => ({
	useRouterState: () => false,
	Link: ({
		children,
		params,
		to,
		className,
	}: {
		children: React.ReactNode
		params?: { address: string }
		to: string
		className?: string
	}) =>
		createElement(
			'a',
			{ href: params ? to.replace('$address', params.address) : to, className },
			children,
		),
}))

const address = '0x1111111111111111111111111111111111111111'
const token = '0x20c0000000000000000000000000000000000000'
const data = {
	blockNumber: '123456',
	fees: [
		{
			token,
			name: 'PathUSD',
			symbol: 'pathUSD',
			currency: 'USD',
			amount: '1178057',
		},
	],
}
const render = () =>
	renderToStaticMarkup(createElement(ValidatorFees, { address, active: true }))

beforeEach(() => {
	section.mode = 'tabs'
	query.mockReturnValue({ data, isError: false })
})

describe('unclaimed fee grid', () => {
	it.each([
		'tabs',
		'stacked',
	])('uses the shared grid header in %s mode without block or refresh controls', (mode) => {
		section.mode = mode
		const html = render()
		expect(html).toContain('grid-cols-subgrid')
		expect(html).toContain(
			'<a href="https://tempo.xyz/developers/docs/guide/node/validator-lifecycle#claim-validator-fees" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">available to claim</a>.',
		)
		expect(html).toContain('>Name</span>')
		expect(html).toContain('>Amount</span>')
		expect(html).toContain('>PathUSD</span>')
		expect(html).toContain(`/api/token/logo/${token}`)
		expect(html).toContain('size-5 shrink-0')
		expect(html).toContain('title="1.178057">1.178057</span>')
		if (mode === 'tabs') {
			expect(html).toContain('>Ticker</span>')
			expect(html).toContain('>Currency</span>')
			expect(html).toContain('>Value</span>')
			expect(html).toContain('>pathUSD</a>')
			expect(html).toContain('>USD</span>')
			expect(html).toContain('$1.18')
		} else expect(html).toContain('>Contract</span>')
		expect(html).not.toContain('As of indexed block')
		expect(html).not.toContain(data.blockNumber)
		expect(html).not.toContain('Refresh')
		expect(html).not.toContain('<button')
	})

	it('keeps missing data and failed reads distinct from zero balances', () => {
		query.mockReturnValue({ data: undefined, isError: false })
		expect(render()).toContain('aria-busy="true"')
		query.mockReturnValue({ data, isError: true })
		expect(render()).toContain('role="alert"')
		expect(render()).not.toContain('1.178057')
		query.mockReturnValue({ data: { ...data, fees: [] }, isError: false })
		expect(render()).toContain('No unclaimed fees.')
	})

	it('keeps the icon and amount when token metadata is unavailable', () => {
		query.mockReturnValue({
			data: {
				...data,
				fees: [
					{
						token,
						name: null,
						symbol: null,
						currency: null,
						amount: '1178057',
					},
				],
			},
			isError: false,
		})
		const html = render()
		expect(html).toContain('>TIP-20</span>')
		expect(html).toContain(`/api/token/logo/${token}`)
		expect(html).toContain('title="1.178057">1.178057</span>')
		expect(html).not.toContain('$1.18')
	})
})
