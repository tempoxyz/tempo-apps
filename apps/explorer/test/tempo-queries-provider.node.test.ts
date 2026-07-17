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
	serverEnv: { TEMPO_API_KEY: 'tempo-api-secret' },
	tempoApiUrl: 'https://api.tempo.xyz',
}))

describe('Tempo query provider', () => {
	beforeAll(async () => {
		await import('#lib/server/tempo-queries-provider')
	})

	it('authenticates indexer requests with the Tempo API key', () => {
		expect(mocks.create).toHaveBeenCalledWith({
			baseUrl: 'https://api.tempo.xyz/v1/indexer',
			headers: { 'tempo-api-key': 'tempo-api-secret' },
		})
	})
})
