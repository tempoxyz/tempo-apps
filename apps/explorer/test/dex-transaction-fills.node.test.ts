import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address } from 'viem'
import { Addresses } from 'viem/tempo'
import { describeDexFill } from '#lib/dex-swaps'
import { getDexTransactionFills } from '#lib/server/dex-swaps'

const { query, multicall } = vi.hoisted(() => ({
	query: vi.fn(),
	multicall: vi.fn(),
}))
vi.mock('#lib/server/env', () => ({
	tempoApi: { url: 'https://api.test', headers: undefined },
	tempoApiUrl: 'https://api.test',
}))
vi.mock('#lib/server/network', () => ({ getChainBackend: () => undefined }))
vi.mock('#lib/server/verified-tokens', () => ({
	getVerifiedTokenAddresses: async () => new Set([USDC, OUSD, PATH]),
}))
vi.mock('#wagmi.config', () => ({
	getTempoChain: () => ({ id: 4217 }),
	getBatchedClient: () => ({ getBlockNumber: async () => 200n, multicall }),
}))

const USDC = '0x20c000000000000000000000b9537d11c60e8b50'
const OUSD = '0x20c0000000000000000000006a37da5c996874be'
const PATH = Addresses.pathUsd
const TX = `0x${'1'.repeat(64)}` as const
const SWITCH_AT = 1_000_000

function rows(columns: string[], values: unknown[][]) {
	return new Response(JSON.stringify({ ok: true, columns, rows: values }), {
		headers: { 'content-type': 'application/json' },
	})
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.stubGlobal('fetch', async (url: URL) =>
		query(new URL(url).searchParams.get('sql') ?? ''),
	)
	query.mockImplementation(async (sql: string) => {
		if (sql.includes('FROM dex_fills'))
			return rows(
				['block_num', 'log_idx', 'tx_hash', 'ts', 'id', 'taker', 'amount'],
				// Filled while USDC.e still quoted pathUSD.
				[
					[
						150,
						14,
						TX,
						SWITCH_AT - 100,
						'5782',
						`0x${'9'.repeat(40)}`,
						'5016012',
					],
				],
			)
		if (sql.includes('FROM dex_orders'))
			return rows(
				['id', 'token', 'bid', 'tick', 'block_num', 'log_idx'],
				[['5782', USDC, 0, 0, 100, 2]],
			)
		if (sql.includes('FROM orderflipped')) return rows(['id'], [])
		if (sql.includes('topic2'))
			return rows(
				['address', 'topic2', 'ts'],
				[[USDC, `0x${'0'.repeat(24)}${OUSD.slice(2)}`, SWITCH_AT]],
			)
		if (sql.includes('FROM dex_pairs'))
			return rows(
				['base', 'quote'],
				[
					[USDC, PATH],
					[USDC, OUSD],
				],
			)
		throw new Error(`Unexpected query: ${sql}`)
	})
	multicall.mockImplementation(async ({ contracts }) =>
		contracts.map(
			({
				address,
				functionName,
			}: {
				address: Address
				functionName: string
			}) => {
				const success = (result: unknown) => ({ status: 'success', result })
				if (functionName === 'symbol')
					return success(
						address === USDC ? 'USDC.e' : address === OUSD ? 'OUSD' : 'pathUSD',
					)
				if (functionName === 'decimals') return success(6)
				return success(address === USDC ? OUSD : PATH)
			},
		),
	)
})

describe('Stablecoin DEX transaction fills', () => {
	it('resolves each fill’s book at the time it filled', async () => {
		const { fills, complete } = await getDexTransactionFills(TX)
		expect(complete).toBe(true)
		const [fill, ...rest] = fills
		expect(rest).toEqual([])
		expect(fill).toMatchObject({
			log: 14,
			base: { address: USDC, symbol: 'USDC.e', decimals: 6 },
			quote: { address: PATH, symbol: 'pathUSD' },
			// USDC.e has since moved to OUSD, retiring this book.
			active: false,
			amount: '5016012',
		})
		if (!fill) return

		const event = describeDexFill(
			{
				type: 'order filled',
				parts: [
					{ type: 'action', value: 'Partial Fill' },
					{ type: 'text', value: '5016012' },
				],
			},
			fill,
		)
		expect(event.parts).toEqual([
			{ type: 'action', value: 'Partial Fill' },
			{
				type: 'amount',
				value: {
					token: USDC,
					value: 5_016_012n,
					decimals: 6,
					symbol: 'USDC.e',
				},
			},
			{ type: 'text', value: 'on' },
			{
				type: 'dexPair',
				value: {
					base: { address: USDC, symbol: 'USDC.e' },
					quote: { address: PATH, symbol: 'pathUSD' },
					active: false,
				},
			},
		])
	})

	it('marks a result incomplete when a book is unresolved or assumed', async () => {
		const reads = multicall.getMockImplementation()
		multicall.mockImplementation(async (options) => {
			const results = await reads?.(options)
			// The base's quote token read fails, so pathUSD is assumed.
			return results.map((result: unknown, index: number) =>
				options.contracts[index].functionName === 'quoteToken'
					? { status: 'failure', error: new Error('reverted') }
					: result,
			)
		})
		expect((await getDexTransactionFills(TX)).complete).toBe(false)

		multicall.mockImplementation(reads)
		const lookup = query.getMockImplementation()
		// The order's placement is not indexed yet.
		query.mockImplementation(async (sql: string) =>
			sql.includes('FROM dex_orders')
				? rows(['id', 'token', 'bid', 'tick', 'block_num', 'log_idx'], [])
				: lookup?.(sql),
		)
		expect(await getDexTransactionFills(TX)).toEqual({
			fills: [],
			complete: false,
		})
	})

	it('reads nothing for a malformed hash', async () => {
		expect(await getDexTransactionFills('0x1234')).toEqual({
			fills: [],
			complete: false,
		})
		expect(query).not.toHaveBeenCalled()
	})
})
