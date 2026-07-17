import { beforeAll, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	create: vi.fn(() => ({
		on: vi.fn(),
	})),
}))

vi.mock('tidx.ts', () => ({
	QB: { from: vi.fn() },
	Tidx: { create: mocks.create },
}))

vi.mock('#lib/server/env', () => ({
	serverEnv: { TIDX_BASIC_AUTH: 'explorer:secret' },
	tempoApiUrl: 'https://api.tempo.xyz',
}))

describe('Tempo query provider', () => {
	beforeAll(async () => {
		await import('#lib/server/tempo-queries-provider')
	})

	it('authenticates TIDX requests with the configured basic auth secret', () => {
		expect(mocks.create).toHaveBeenCalledWith({
			basicAuth: 'explorer:secret',
			baseUrl: 'https://api.tempo.xyz/v1/indexer',
		})
	})
})
