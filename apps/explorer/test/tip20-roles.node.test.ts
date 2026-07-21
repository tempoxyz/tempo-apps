import * as Hash from 'ox/Hash'
import * as Hex from 'ox/Hex'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ROLE_MEMBERSHIP_UPDATED_SELECTOR =
	'0x4811f35680ba814bed6b0b926a2949c8a1000f4f2443cfe9978745d46a251aec'
const TOKEN_ADDRESS = '0x20c000000000000000000000d65b4808c85dbb81'
const ROLE_HOLDER = '0x23bc00000000000000000000000000000000174a'

const mocks = vi.hoisted(() => {
	const queryCalls: unknown[][] = []
	let queryResult: unknown[] | Error = []

	const queryBuilder = {
		selectFrom(...args: unknown[]) {
			queryCalls.push(['selectFrom', ...args])
			return this
		},
		select(...args: unknown[]) {
			queryCalls.push(['select', ...args])
			return this
		},
		where(...args: unknown[]) {
			queryCalls.push(['where', ...args])
			return this
		},
		orderBy(...args: unknown[]) {
			queryCalls.push(['orderBy', ...args])
			return this
		},
		limit(...args: unknown[]) {
			queryCalls.push(['limit', ...args])
			return this
		},
		async execute() {
			queryCalls.push(['execute'])
			if (queryResult instanceof Error) throw queryResult
			return queryResult
		},
	}

	return {
		queryCalls,
		queryBuilder,
		readContracts: vi.fn(),
		reset() {
			queryCalls.length = 0
			queryResult = []
		},
		setQueryResult(result: unknown[] | Error) {
			queryResult = result
		},
	}
})

vi.mock('wagmi/actions', () => ({
	getChainId: () => 4217,
	readContracts: mocks.readContracts,
}))

vi.mock('#lib/server/tempo-queries-provider', () => ({
	tempoQueryBuilder: () => mocks.queryBuilder,
}))

vi.mock('#wagmi.config', () => ({
	getWagmiConfig: () => ({}),
}))

import { Route } from '#routes/api/tip20-roles'

type Tip20RolesHandler = (context: { request: Request }) => Promise<Response>

const handler = (
	Route as unknown as {
		options: { server: { handlers: { GET: Tip20RolesHandler } } }
	}
).options.server.handlers.GET

function request(): Request {
	return new Request(
		`https://explore.tempo.xyz/api/tip20-roles?address=${TOKEN_ADDRESS}&chainId=4217`,
	)
}

describe('TIP-20 roles API', () => {
	beforeEach(() => {
		mocks.reset()
		mocks.readContracts.mockReset()
		mocks.readContracts.mockResolvedValue([
			{ result: 1_000_000n },
			{ result: 'CAD' },
			{ result: 1n },
			{ result: false },
			{ result: 6 },
			{ result: 'CADD' },
			{ result: 100_000_000n },
		])
	})

	it('filters role events by topic before applying the scan limit', async () => {
		const pauseRole = Hash.keccak256(Hex.fromString('PAUSE_ROLE'))
		mocks.setQueryResult([
			{
				topic0: ROLE_MEMBERSHIP_UPDATED_SELECTOR,
				topic1: pauseRole,
				topic2: Hex.padLeft(ROLE_HOLDER, 32),
				data: Hex.padLeft('0x01', 32),
				block_timestamp: 1_784_237_255,
				tx_hash: '0x1234',
				block_num: 100,
				log_idx: 0,
			},
		])

		const response = await handler({ request: request() })

		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			rolesUnavailable: false,
			roles: [
				{
					role: 'PAUSE',
					account: ROLE_HOLDER,
					grantedAt: 1_784_237_255,
					grantedTx: '0x1234',
				},
			],
		})

		const topicFilterIndex = mocks.queryCalls.findIndex(
			(call) =>
				call[0] === 'where' &&
				call[1] === 'topic0' &&
				call[2] === '=' &&
				call[3] === ROLE_MEMBERSHIP_UPDATED_SELECTOR,
		)
		const limitIndex = mocks.queryCalls.findIndex(
			(call) => call[0] === 'limit' && call[1] === 10_000,
		)

		expect(mocks.queryCalls).toContainEqual([
			'where',
			'address',
			'=',
			TOKEN_ADDRESS,
		])
		expect(topicFilterIndex).toBeGreaterThan(-1)
		expect(limitIndex).toBeGreaterThan(topicFilterIndex)
	})

	it('returns config without caching when the role query fails', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.setQueryResult(new Error('TIDX unavailable'))

		try {
			const response = await handler({ request: request() })

			expect(response.status).toBe(200)
			expect(response.headers.get('Cache-Control')).toBe('no-store')
			expect(await response.json()).toMatchObject({
				roles: [],
				rolesUnavailable: true,
				config: {
					totalSupply: '100 CADD',
					supplyCap: '1 CADD',
					currency: 'CAD',
					transferPolicyId: '1',
					paused: false,
				},
			})
		} finally {
			consoleError.mockRestore()
		}
	})
})
