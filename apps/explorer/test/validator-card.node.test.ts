import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidatorCard } from '#comps/ValidatorCard'

const { readContract, copy, copyState } = vi.hoisted(() => ({
	readContract: vi.fn(),
	copy: vi.fn(),
	copyState: { notifying: false },
}))
vi.mock('wagmi', () => ({ useReadContract: readContract }))
vi.mock('#lib/hooks', () => ({
	useIsMounted: () => true,
	useCopy: () => ({ copy, notifying: copyState.notifying }),
}))
vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		params,
		search,
		className,
	}: {
		children: React.ReactNode
		to: string
		params: Record<string, string>
		search?: { tab: string }
		className?: string
	}) =>
		createElement(
			'a',
			{
				className,
				href:
					to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? '') +
					(search ? `?tab=${search.tab}` : ''),
			},
			children,
		),
}))

const address = '0x1111111111111111111111111111111111111111'
const validator = {
	validatorAddress: address,
	feeRecipient: '0x2222222222222222222222222222222222222222',
	index: 0n,
	addedAtHeight: 0n,
	deactivatedAtHeight: 0n,
	publicKey: `0x${'ab'.repeat(32)}`,
	ingress: 'private-ingress.example:8000',
	egress: 'private-egress.example:8001',
}
const render = () =>
	renderToStaticMarkup(createElement(ValidatorCard, { address }))

beforeEach(() => {
	readContract.mockReturnValue({ data: validator })
	copy.mockClear()
	copyState.notifying = false
})

describe('validator address card', () => {
	it('copies the full fee recipient without navigating the address link', () => {
		const html = render()
		expect(html).toContain('aria-label="Copy fee recipient"')
		const recipientSection = ValidatorCard({ address })?.props.sections[1]
		const copyButton = recipientSection.props.children[0].props.children[1]
		copyButton.props.onClick()
		expect(copy).toHaveBeenCalledExactlyOnceWith(validator.feeRecipient)
		expect(html).toContain(
			`href="/address/${validator.feeRecipient}?tab=holdings"`,
		)
	})

	it('confirms when the fee recipient was copied', () => {
		copyState.notifying = true
		const html = render()
		expect(html).toContain('aria-label="Fee recipient copied"')
		expect(html).toContain('>copied</span>')
	})

	it('links the full fee recipient to holdings, matches address typography and preserves genesis height', () => {
		const html = render()
		expect(html).toContain('>Yes<')
		expect(html).not.toContain('>Index<')
		expect(html).toContain(
			'font-mono copy-13 text-primary break-all leading-relaxed max-w-[32ch]',
		)
		expect(html).toContain('class="normal-case">Added at height</span>')
		expect(html).toContain(
			`href="/address/${validator.feeRecipient}?tab=holdings"`,
		)
		expect(html).toContain(`>${validator.feeRecipient}</a>`)
		expect(html).toContain('href="/block/0"')
		expect(html).not.toContain('Deactivated')
		expect(readContract.mock.lastCall?.[0]).toMatchObject({
			functionName: 'validatorByAddress',
			args: [address],
		})
	})

	it('shows inactive validators and exact uint64 heights without rounding', () => {
		readContract.mockReturnValue({
			data: {
				...validator,
				index: 15n,
				addedAtHeight: 9007199254740993n,
				deactivatedAtHeight: 9007199254740995n,
			},
		})
		const html = render()
		expect(html).toContain('>No<')
		expect(html).not.toContain('>Index<')
		expect(html).not.toContain('>15<')
		expect(html).toContain('class="normal-case">Deactivated at height</span>')
		expect(html).toContain('href="/block/9007199254740993"')
		expect(html).toContain('href="/block/9007199254740995"')
	})

	it('never renders public keys or networking information', () => {
		const html = render()
		for (const hidden of [
			validator.publicKey,
			validator.ingress,
			validator.egress,
			'Public key',
			'Ingress',
			'Egress',
		])
			expect(html).not.toContain(hidden)
	})

	it('does not show a card while loading or for an unknown validator', () => {
		readContract.mockReturnValue({ data: undefined })
		expect(render()).toBe('')
		readContract.mockReturnValue({
			data: undefined,
			error: new Error('ValidatorNotFound'),
		})
		expect(render()).toBe('')
	})
})
