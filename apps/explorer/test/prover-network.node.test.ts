import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
	network: 'zone-prover',
	epoch: 'genesis-a',
	fetcher: undefined as typeof fetch | undefined,
}))
vi.mock('#lib/env', () => ({ getTempoEnv: () => state.network }))
vi.mock('#lib/server/env', () => ({
	serverEnv: {
		get ZONE_PROVER_DATA_EPOCH() {
			return state.epoch
		},
	},
	tempoApiUrl: 'https://api.tempo.xyz',
}))
vi.mock('tapimo/client', () => ({
	create: (options: { fetch: typeof fetch }) => {
		state.fetcher = options.fetch
		return {}
	},
}))
import { networkCacheScope } from '#lib/server/network'
import '#lib/server/tempo-api'

afterEach(() => vi.unstubAllGlobals())
describe('prover backend isolation', () => {
	it('does not call the shared Tempo API for a prover request', async () => {
		state.network = 'zone-prover'
		const upstream = vi.fn()
		vi.stubGlobal('fetch', upstream)
		const response = await state.fetcher?.(
			'https://api.tempo.xyz/v1/transactions?chainId=31318',
		)
		expect(response?.status).toBe(503)
		expect(upstream).not.toHaveBeenCalled()
	})
	it('separates same-chain caches and invalidates them across genesis epochs', () => {
		state.network = 'devnet'
		const devnet = networkCacheScope()
		state.network = 'zone-prover'
		const prover = networkCacheScope()
		expect(prover).not.toBe(devnet)
		state.epoch = 'genesis-b'
		expect(networkCacheScope()).not.toBe(prover)
	})
})
