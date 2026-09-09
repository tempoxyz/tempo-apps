import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildZonePortalOgUrl } from '../../explorer/src/lib/og-params.ts'
import { ZonePortalCard } from '../src/zone-portal-card.tsx'
import {
	fetchPortalOverview,
	formatPortalBalance,
	portalId,
	portalQuerySchema,
	type PortalOverview,
} from '../src/zone-portal.ts'

const address = '0x5ad0000000000000000000000000000000000001'
const overview: PortalOverview = {
	isZonePortal: true,
	counts: { deposits: 95, withdrawals: 90, batches: 24502 },
	assets: [
		{
			address: '0x20c0000000000000000000006fD9A167923ba194',
			symbol: 'DLUSD',
			decimals: 6,
			balance: '11895002',
		},
	],
}

test('explorer selects a network-specific portal image, with no fabricated counts', () => {
	for (const network of ['mainnet', 'testnet', 'devnet', 'nextfork'] as const) {
		const url = new URL(
			buildZonePortalOgUrl('https://og.tempo.xyz', address, network),
		)
		assert.equal(url.pathname, `/zone-portal/${address}`)
		assert.deepEqual(
			portalQuerySchema.parse(Object.fromEntries(url.searchParams)),
			{ network },
		)
	}
	assert.equal(
		portalQuerySchema.safeParse({ network: 'https://example.com' }).success,
		false,
	)
})

test('fetches the selected network overview and renders the returned counts and balances', async () => {
	const data = await fetchPortalOverview(address, 'mainnet', (async (
		url,
		init,
	) => {
		assert.equal(
			url,
			`https://explore.tempo.xyz/api/address/zone-portal/${address}`,
		)
		assert.equal(init?.redirect, 'manual')
		assert.ok(init?.signal)
		return Response.json(overview)
	}) as typeof fetch)
	const html = ZonePortalCard({
		address,
		network: 'mainnet',
		overview: data,
		updated: '2026-09-09 15:30',
	}).toString()
	for (const text of [
		'Deposits',
		'Withdrawals',
		'Batches',
		'>95<',
		'>90<',
		'>24,502<',
		'DLUSD',
		'11.895002',
		address,
	])
		assert.ok(html.includes(text), text)
	assert.doesNotMatch(html, /Events|ERC-1167/)
})

test('real zero counts remain zero; unavailable data is never rendered as zero', () => {
	const empty = ZonePortalCard({
		address,
		network: 'testnet',
		overview: {
			...overview,
			counts: { deposits: 0, withdrawals: 0, batches: 0 },
			assets: [],
		},
		updated: '',
	}).toString()
	assert.equal([...empty.matchAll(/>0</g)].length, 3)
	const unavailable = ZonePortalCard({
		address,
		network: 'testnet',
		updated: '',
	}).toString()
	assert.match(unavailable, /Data temporarily unavailable/)
	assert.doesNotMatch(unavailable, />0</)
})

test('rejects unavailable and malformed source data', async () => {
	await assert.rejects(
		fetchPortalOverview(
			address,
			'mainnet',
			(async () => new Response(null, { status: 503 })) as typeof fetch,
		),
		/503/,
	)
	await assert.rejects(
		fetchPortalOverview(address, 'mainnet', (async () =>
			Response.json({
				...overview,
				counts: { deposits: -1, withdrawals: 0, batches: 0 },
			})) as typeof fetch),
	)
	assert.equal(
		portalId('0x1111111111111111111111111111111111111111'),
		undefined,
	)
	assert.equal(
		portalId('0x5ad0000000000000000000000000000000000000'),
		undefined,
	)
	assert.equal(portalId(address.toUpperCase()), 1n)
	assert.equal(
		portalId('0x5ad0000000000000000000000000000100000000'),
		undefined,
	)
})

test('formats token units without losing integer precision', () => {
	assert.equal(formatPortalBalance('11895002', 6), '11.895002')
	assert.equal(formatPortalBalance('0', 6), '0')
	assert.equal(formatPortalBalance('1', 18), '<0.000001')
	assert.equal(
		formatPortalBalance('12345678901234567890', 0),
		'12,345,678,901,234,567,890',
	)
})
