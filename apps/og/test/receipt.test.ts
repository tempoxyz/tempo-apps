import assert from 'node:assert/strict'
import { test } from 'node:test'
import { txOgQuerySchema } from '../src/params.ts'
import { ReceiptCard, ReceiptDetails } from '../src/ui.tsx'

test('multi-step preview preserves totals and the true remaining step count', () => {
	const query = txOgQuerySchema.parse({
		eventCount: '12',
		ev1: 'Swap|A for B|$20',
		ev2: 'Transfer|B to account',
		ev3: 'Deposit|B into vault',
		total: '$20',
		fee: '$0.01',
	})
	const html = ReceiptCard({
		data: { ...query, hash: '0x', blockNumber: '123' },
	}).toString()
	assert.match(html, /Swap/)
	assert.match(html, /Transfer/)
	assert.match(html, /Deposit/)
	assert.match(html, /9.*more steps/)
	assert.match(html, /Total/)
	assert.match(html, /\$20/)
})

test('only token addresses can enter the icon lookup', () => {
	const query = txOgQuerySchema.parse({
		ev1: `Swap|A|||https://example.com,0x${'20'.repeat(20)}`,
	})
	assert.deepEqual(query.events[0]?.tokens, [`0x${'20'.repeat(20)}`])
})

test('token logos immediately precede their matching name with asset color', () => {
	const html = ReceiptDetails({
		event: {
			action: 'Swap',
			details: '20 AlphaUSD for 19 BetaUSD',
			tokens: ['a', 'b'],
			tokenSymbols: ['AlphaUSD', 'BetaUSD'],
		},
		icons: { a: '/alpha.svg', b: '/beta.svg' },
		compact: false,
	}).toString()
	assert.match(html, /src="\/alpha.svg"[^>]*>AlphaUSD/)
	assert.match(html, /src="\/beta.svg"[^>]*>BetaUSD/)
	assert.match(html, /#009b72/)
})
