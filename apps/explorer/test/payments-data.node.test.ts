import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reads: { from?: string; to?: string }[] = []
let indexerUp = true
// Each read returns one row per day in its range from this ledger.
const ledger = new Map<string, { moved: string; minted: string }>()

vi.mock('cloudflare:workers', () => ({ waitUntil: () => {} }))
vi.mock('#lib/server/dex-indexer', () => ({
	list: (values: string[]) => values.map((v) => `'${v}'`).join(','),
	sqlTime: (ms: number) =>
		new Date(ms).toISOString().replace('T', ' ').slice(0, 19),
	indexer: async (_chain: number, sql: string) => {
		if (!indexerUp) throw new Error('indexer down')
		const from = /block_timestamp >= '([\d-]+)/.exec(sql)?.[1]
		const to = /block_timestamp < '([\d-]+)/.exec(sql)?.[1]
		reads.push({ from, to })
		return [...ledger]
			.filter(([day]) => (!from || day >= from) && (!to || day < to))
			.map(([day, v]) => ({
				day,
				address: '0x20c0000000000000000000000000000000000000',
				minted: v.minted,
				burned: '0',
				moved: v.moved,
			}))
	},
}))

// A Cache API stand-in, as the edge provides.
const store = new Map<string, string>()
beforeEach(() => {
	store.clear()
	reads.length = 0
	ledger.clear()
	indexerUp = true
	vi.stubGlobal('caches', {
		default: {
			match: async (r: Request) => {
				const v = store.get(r.url)
				return v === undefined ? undefined : new Response(v)
			},
			put: async (r: Request, res: Response) => {
				store.set(r.url, await res.text())
			},
		},
	})
	vi.stubGlobal(
		'fetch',
		async () => new Response(JSON.stringify({}), { status: 200 }),
	)
})
afterEach(() => vi.unstubAllGlobals())

const M = 1_000_000
const day = (d: string, moved: number, minted = 0) =>
	ledger.set(d, { moved: String(moved * M), minted: String(minted * M) })
const at = (iso: string) => Date.parse(iso)
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('payments snapshot around UTC midnight', async () => {
	const { getPaymentsSnapshot } = await import('#lib/server/payments-data.ts')
	const tpv = (s: Awaited<ReturnType<typeof getPaymentsSnapshot>>, d: string) =>
		s.days.find((x) => x.day === d)?.tpv

	it('keeps yesterday from the cached today until history covers it', async () => {
		day('2026-11-20', 10, 100)
		day('2026-11-21', 20, 5)
		await getPaymentsSnapshot(4217, at('2026-11-21T23:59:00Z'))
		await flush()
		// After midnight, the indexer is down: both parts are stale.
		indexerUp = false
		const s = await getPaymentsSnapshot(4217, at('2026-11-22T00:05:00Z'))
		expect(tpv(s, '2026-11-21')).toBe(20)
		expect(s.days.find((x) => x.day === '2026-11-21')?.stablecoin).toBe(105)
		expect(s.through).toBe('2026-11-21')
	})

	it('re-reads a day the indexer had not finished at midnight', async () => {
		day('2026-11-20', 10, 100)
		day('2026-11-21', 20)
		await getPaymentsSnapshot(4217, at('2026-11-21T23:00:00Z'))
		await flush()
		// Midnight: history appends Nov 21 while the indexer lags.
		await getPaymentsSnapshot(4217, at('2026-11-22T00:02:00Z'))
		await flush()
		// The indexer then catches up on Nov 21.
		day('2026-11-21', 25, 7)
		await getPaymentsSnapshot(4217, at('2026-11-22T00:45:00Z'))
		await flush()
		const s = await getPaymentsSnapshot(4217, at('2026-11-22T00:46:00Z'))
		expect(tpv(s, '2026-11-21')).toBe(25)
		expect(s.days.find((x) => x.day === '2026-11-21')?.stablecoin).toBe(107)
		// No day is counted twice.
		expect(tpv(s, '2026-11-20')).toBe(10)
	})

	it('serves the last good data while the indexer is down', async () => {
		day('2026-11-20', 10, 100)
		await getPaymentsSnapshot(4217, at('2026-11-21T10:00:00Z'))
		await flush()
		indexerUp = false
		const s = await getPaymentsSnapshot(4217, at('2026-11-21T12:00:00Z'))
		expect(tpv(s, '2026-11-20')).toBe(10)
	})

	it('keeps the last good RWA price when only bitcoin refreshes', async () => {
		day('2026-11-20', 10, 100)
		let geckoUp = true
		vi.stubGlobal('fetch', async (url: string) => {
			if (url.includes('coingecko'))
				return geckoUp
					? new Response(
							JSON.stringify({
								'hastra-prime': { usd: 1.07 },
								bitcoin: { usd: 60000 },
							}),
						)
					: new Response('', { status: 503 })
			if (url.includes('coinbase'))
				return new Response(JSON.stringify({ data: { amount: '61000' } }))
			return new Response(JSON.stringify({}))
		})
		await getPaymentsSnapshot(4217, at('2026-11-21T10:00:00Z'))
		await flush()
		geckoUp = false
		// Past the market prices' freshness, a refresh runs with CoinGecko down.
		await getPaymentsSnapshot(4217, at('2026-11-21T10:30:00Z'))
		await flush()
		const s = await getPaymentsSnapshot(4217, at('2026-11-21T10:31:00Z'))
		expect(s.unpriced).not.toContain('hastra-prime')
		expect(s.unpriced).not.toContain('bitcoin')
	})

	it('warns when the cached day stopped short of its close', async () => {
		day('2026-11-20', 10, 100)
		day('2026-11-21', 20, 5)
		await getPaymentsSnapshot(4217, at('2026-11-21T10:00:00Z'))
		await flush()
		// The indexer goes down at 10:00 and stays down past midnight.
		indexerUp = false
		const s = await getPaymentsSnapshot(4217, at('2026-11-22T01:00:00Z'))
		expect(tpv(s, '2026-11-21')).toBe(20)
		expect(s.through).toBe('2026-11-20')
	})
})
