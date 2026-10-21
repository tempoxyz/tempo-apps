import assert from 'node:assert/strict'
import { test } from 'node:test'
import { color } from '../src/brand.tsx'
import { txOgQuerySchema } from '../src/params.ts'
import { formatReceiptDate, ReceiptCard, ReceiptDetails } from '../src/ui.tsx'

test('multi-step preview leads with the total and keeps the true remaining count', () => {
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
	assert.match(html, /\$20</)
	assert.match(html, /Swap/)
	assert.match(html, /Transfer/)
	assert.match(html, /Deposit/)
	assert.match(html, /\+9 more actions/)
	assert.match(html, /Network fee/)
	assert.match(html, /\$0\.01/)
})

test('a single payment leads with its amount and keeps the total as a fact', () => {
	const query = txOgQuerySchema.parse({
		ev1: 'Send|10.00 AlphaUSD to 0x71C7…976F|$10.00',
		total: '$10.01',
		status: 'success',
	})
	const html = ReceiptCard({
		data: { ...query, hash: '0x', blockNumber: '123' },
	}).toString()
	assert.match(html, />\$10\.00</)
	assert.match(html, /Confirmed/)
	assert.match(html, />Total</)
	assert.match(html, />\$10\.01</)
})

test('a failed payment strikes through the amount that never moved', () => {
	const query = txOgQuerySchema.parse({
		ev1: 'Send|10.00 AlphaUSD to 0x71C7…976F|$10.00',
		status: 'reverted',
	})
	const html = ReceiptCard({
		data: { ...query, hash: '0x', blockNumber: '123' },
	}).toString()
	assert.match(html, /Failed/)
	assert.match(html, /text-decoration-line:line-through[^>]*>\$10\.00</)
})

test('failed receipts are tagged and never show missing data', () => {
	const html = ReceiptCard({
		data: {
			...txOgQuerySchema.parse({ status: 'reverted', eventsFailed: 'true' }),
			hash: `0x${'ab'.repeat(32)}`,
			blockNumber: '—',
		},
	}).toString()
	assert.match(html, /Failed/)
	assert.match(html, /Summary unavailable/)
	assert.match(html, /0xabab…abab/)
	assert.doesNotMatch(html, /Block|Network fee|From/)
})

test('only token addresses can enter the icon lookup', () => {
	const query = txOgQuerySchema.parse({
		ev1: `Swap|A|||https://example.com,0x${'20'.repeat(20)}`,
	})
	assert.deepEqual(query.events[0]?.tokens, [`0x${'20'.repeat(20)}`])
})

test('token logos immediately precede their matching name in the foreground', () => {
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
	assert.match(
		html,
		new RegExp(`color:${color.foreground}"><img src="/alpha.svg"`),
	)
	assert.match(html, new RegExp(`color:${color.secondary}">for<`))
})

test('receipt times read as TDS timestamps in UTC', () => {
	assert.equal(
		formatReceiptDate('Oct 20, 2026', '09:41'),
		'Oct 20, 2026, 09:41 UTC',
	)
	assert.equal(
		formatReceiptDate('03/12/2026', '19:59:07'),
		'Mar 12, 2026, 19:59:07 UTC',
	)
	assert.equal(
		formatReceiptDate('3/1/2026', '7:05 PM'),
		'Mar 1, 2026, 19:05 UTC',
	)
	assert.equal(formatReceiptDate('—', '—'), '')
	assert.equal(formatReceiptDate('soon', '—'), 'soon')
})
