import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAddressOgUrl } from '../../explorer/src/lib/og-params.ts'
import { addressOgQuerySchema } from '../src/params.ts'
import { AddressCard } from '../src/ui.tsx'

const address = '0x5ad0000000000000000000000000000000000001'

function render(params: Parameters<typeof buildAddressOgUrl>[1]) {
	const url = new URL(buildAddressOgUrl('https://og.tempo.xyz', params))
	const data = addressOgQuerySchema.parse(Object.fromEntries(url.searchParams))
	return AddressCard({
		data: { ...data, address, tokensHeld: data.tokens },
	}).toString()
}

test('contract identity survives the explorer URL and worker parser without invented activity', () => {
	const html = render({
		address,
		accountType: 'contract',
		contractName: 'Zone Portal Proxy #1',
		contractDescription: 'ERC-1167 minimal proxy for Tempo Zone 1',
	})
	assert.match(html, /Zone Portal Proxy #1/)
	assert.match(html, /ERC-1167 minimal proxy for Tempo Zone 1/)
	assert.doesNotMatch(html, /Events|Created|Holdings|Last Active/)
})

test('missing account data is not displayed as a zero balance or activity count', () => {
	const html = render({ address, accountType: 'empty' })
	assert.doesNotMatch(html, /\$0\.00|Transactions|Holdings|Created|Last Active/)
})

test('known zero values and populated activity remain visible', () => {
	const html = render({
		address,
		accountType: 'account',
		holdings: '$0.00',
		txCount: '0',
		created: 'Jan 1, 2026',
		lastActive: 'Sep 9, 2026',
	})
	assert.match(html, /Holdings/)
	assert.match(html, /\$0\.00/)
	assert.match(html, /Transactions/)
	assert.match(html, />0</)
	assert.match(html, /Jan 1, 2026/)
	assert.match(html, /Sep 9, 2026/)
})

test('contract descriptions are bounded and escaped', () => {
	const html = render({
		address,
		accountType: 'contract',
		contractDescription: `<script>${'x'.repeat(300)}</script>`,
	})
	assert.doesNotMatch(html, /<script>/i)
	assert.match(html, /&lt;script&gt;/)
	assert.doesNotMatch(html, /x{181}/)
})
