import { afterEach, describe, expect, it, vi } from 'vitest'
import app from '../src/index.tsx'

const mainnetTokenlist = {
	name: 'Tempo Mainnet',
	timestamp: '2026-07-02T18:47:38.459Z',
	version: { major: 1, minor: 0, patch: 25 },
	tokens: [
		{
			chainId: 4217,
			address: '0x20c0000000000000000000000000000000000000',
			decimals: 6,
			name: 'PathUSD',
			symbol: 'pathUSD',
			logoURI:
				'https://api.tempo.xyz/assets/4217/icons/0x20c0000000000000000000000000000000000000',
		},
		{
			chainId: 4217,
			address: '0x20c000000000000000000000b9537d11c60e8b50',
			decimals: 6,
			name: 'Bridged USDC (Stargate)',
			symbol: 'USDC.e',
			logoURI:
				'https://api.tempo.xyz/assets/4217/icons/0x20c000000000000000000000b9537d11c60e8b50',
		},
	],
}

const testnetTokenlist = {
	name: 'Tempo Testnet (Moderato)',
	timestamp: '2026-07-02T18:47:38.461Z',
	version: { major: 1, minor: 0, patch: 6 },
	tokens: [
		{
			chainId: 42431,
			address: '0x20c0000000000000000000000000000000000000',
			decimals: 6,
			name: 'PathUSD',
			symbol: 'pathUSD',
		},
	],
}

type RequestRecord = {
	headers?: HeadersInit | undefined
	url: string
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		headers: { 'content-type': 'application/json' },
		status,
	})
}

function stubTempoApi(resolve: (url: URL) => Response): RequestRecord[] {
	const requests: RequestRecord[] = []
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(input.toString())
			requests.push({ headers: init?.headers, url: url.toString() })
			return resolve(url)
		}),
	)
	return requests
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('tokenlist route', () => {
	it('proxies the Tempo API tokenlist endpoint', async () => {
		const requests = stubTempoApi(() => json(mainnetTokenlist))

		const response = await app.request(
			'/list/4217',
			{},
			{ TEMPO_API_KEY: 'secret' },
		)

		await expect(response.json()).resolves.toEqual(mainnetTokenlist)
		expect(requests).toEqual([
			{
				headers: { 'tempo-api-key': 'secret' },
				url: 'https://api.tempo.xyz/v1/tokenlist?chainId=4217',
			},
		])
	})

	it('resolves assets from the proxied tokenlist', async () => {
		stubTempoApi(() => json(mainnetTokenlist))

		const response = await app.request('/asset/4217/USDC.e', {}, {})

		await expect(response.json()).resolves.toEqual(mainnetTokenlist.tokens[1])
	})

	it('omits unsupported upstream tokenlists from the aggregate route', async () => {
		stubTempoApi((url) => {
			const chainId = url.searchParams.get('chainId')
			if (chainId === '4217') return json(mainnetTokenlist)
			if (chainId === '42431') return json(testnetTokenlist)
			return json({ error: 'unsupported' }, 400)
		})

		const response = await app.request('/lists/all', {}, {})

		await expect(response.json()).resolves.toEqual([
			testnetTokenlist,
			mainnetTokenlist,
		])
	})
})
