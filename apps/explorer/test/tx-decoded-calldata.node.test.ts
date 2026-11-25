import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { encodeFunctionData, parseAbi } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TxDecodedCalldata } from '#comps/TxDecodedCalldata'

const { lookup } = vi.hoisted(() => ({
	lookup: { signature: null as string | null },
}))
vi.mock('#lib/queries', () => ({
	useAutoloadAbi: () => ({ data: undefined }),
	useLookupSignature: () => ({ data: lookup.signature, isFetched: true }),
}))
vi.mock('#lib/hooks', () => ({
	useCopy: () => ({ copy: vi.fn(), notifying: false }),
}))

const address = '0x1111111111111111111111111111111111111111'
const data = encodeFunctionData({
	abi: parseAbi(['function transfer(address to, uint256 amount)']),
	functionName: 'transfer',
	args: [address, 1n],
})
const render = () =>
	renderToStaticMarkup(createElement(TxDecodedCalldata, { address, data }))

beforeEach(() => {
	lookup.signature = null
})

describe('decoded calldata', () => {
	it('decodes calldata with a looked-up signature', () => {
		lookup.signature = 'transfer(address,uint256)'
		const html = render()
		expect(html).toContain('transfer')
		expect(html).not.toContain(data)
	})

	it('shows raw calldata when the looked-up signature is malformed', () => {
		lookup.signature = 'transfer(address,uint256'
		expect(render).not.toThrow()
		expect(render()).toContain(data)
	})
})
