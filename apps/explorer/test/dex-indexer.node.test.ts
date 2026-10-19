import { afterEach, describe, expect, it, vi } from 'vitest'
import { indexer } from '#lib/server/dex-indexer'

const { backend } = vi.hoisted(() => ({ backend: vi.fn() }))
vi.mock('#lib/server/env', () => ({
	tempoApi: { url: 'https://api.test', headers: { 'tempo-api-key': 'key' } },
	tempoApiUrl: 'https://api.test',
}))
vi.mock('#lib/server/network', () => ({ getChainBackend: backend }))
vi.mock('#wagmi.config', () => ({ getBatchedClient: () => ({}) }))

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetAllMocks()
})

function respond() {
	const fetch = vi.fn(
		async (_url: URL, _init?: RequestInit) =>
			new Response(JSON.stringify({ ok: true, columns: ['n'], rows: [[1]] })),
	)
	vi.stubGlobal('fetch', fetch)
	return fetch
}

describe('DEX indexer queries', () => {
	it('use a chain’s own tidx when it has one', async () => {
		backend.mockReturnValue({
			url: 'https://tidx.devnet.test',
			headers: { Authorization: 'Basic abc' },
		})
		const fetch = respond()
		expect(await indexer(31318, 'SELECT 1 AS n')).toEqual([{ n: 1 }])
		const [url, init] = fetch.mock.calls[0] ?? []
		expect(String(url)).toMatch(/^https:\/\/tidx\.devnet\.test\/query\?/)
		expect(init?.headers).toMatchObject({ Authorization: 'Basic abc' })
	})

	it('fall back to the Tempo API indexer', async () => {
		backend.mockReturnValue(undefined)
		const fetch = respond()
		await indexer(4217, 'SELECT 1 AS n', 'Event(uint256 a)')
		const [url, init] = fetch.mock.calls[0] ?? []
		const parsed = new URL(String(url))
		expect(parsed.origin + parsed.pathname).toBe(
			'https://api.test/v1/indexer/query',
		)
		expect(parsed.searchParams.get('signature')).toBe('Event(uint256 a)')
		expect(init?.headers).toMatchObject({ 'tempo-api-key': 'key' })
	})
})
