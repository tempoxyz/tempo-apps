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
	}: {
		children: React.ReactNode
		params: { address: string }
	}) => createElement('a', { href: `/address/${params.address}` }, children),
}))

const address = '0x1111111111111111111111111111111111111111'
const token = '0x20c0000000000000000000000000000000000000'
const data = {
	blockNumber: '123456',
	fees: [{ token, symbol: 'pathUSD', amount: '1' }],
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
		expect(html).toContain('>Token</span>')
		expect(html).toContain('>Unclaimed amount</span>')
		expect(html).toContain(`href="/address/${token}"`)
		expect(html).toContain(token)
		expect(html).toContain('>0.000001</span>')
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
		expect(render()).not.toContain('0.000001')
		query.mockReturnValue({ data: { ...data, fees: [] }, isError: false })
		expect(render()).toContain('No unclaimed fees.')
	})
})
