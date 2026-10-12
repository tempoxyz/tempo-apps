import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveTempoApi, serverEnv } from '#lib/server/env'
import {
	getChainBackend,
	getDevnetBackend,
	getExplorerRpcBackend,
} from '#lib/server/network'

vi.mock('#lib/server/env', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/env')>()),
	serverEnv: {},
}))

const RPC_AUTH = 'Basic cnBjOnRlc3Q='
const TIDX_AUTH = 'Basic dGlkeDp0ZXN0'

afterEach(() => {
	for (const key of Object.keys(serverEnv))
		delete serverEnv[key as keyof typeof serverEnv]
	vi.unstubAllEnvs()
})

describe('devnet backend overrides', () => {
	it('keeps the default devnet backends while unset', () => {
		expect(getDevnetBackend('devnet', 'rpc')).toBeUndefined()
		expect(getDevnetBackend('devnet', 'tidx')).toBeUndefined()
		expect(getExplorerRpcBackend('devnet', 'explorer:test')).toEqual({
			chainId: 31318,
			url: 'https://rpc.devnet.tempoxyz.dev',
			headers: { Authorization: `Basic ${btoa('explorer:test')}` },
		})
	})

	it('routes a devnet build to the configured RPC and TIDX', () => {
		serverEnv.DEVNET_RPC_URL = 'https://rpc-my-stack.devnet.tempoxyz.dev'
		serverEnv.DEVNET_RPC_AUTH = RPC_AUTH
		serverEnv.DEVNET_TIDX_URL = 'https://tidx-my-stack.devnet.tempoxyz.dev'
		serverEnv.DEVNET_TIDX_AUTH = TIDX_AUTH

		expect(getExplorerRpcBackend('devnet', undefined)).toEqual({
			chainId: 31318,
			url: 'https://rpc-my-stack.devnet.tempoxyz.dev',
			headers: { Authorization: RPC_AUTH },
		})
		vi.stubEnv('VITE_TEMPO_ENV', 'devnet')
		expect(getChainBackend(31318, 'tidx')).toEqual({
			url: 'https://tidx-my-stack.devnet.tempoxyz.dev',
			headers: { Authorization: TIDX_AUTH },
		})
	})

	it('ignores the overrides in every other build', () => {
		serverEnv.DEVNET_RPC_URL = 'https://rpc-my-stack.devnet.tempoxyz.dev'
		serverEnv.DEVNET_RPC_AUTH = RPC_AUTH
		serverEnv.DEVNET_TIDX_URL = 'https://tidx-my-stack.devnet.tempoxyz.dev'
		serverEnv.DEVNET_TIDX_AUTH = TIDX_AUTH

		expect(getExplorerRpcBackend('nextfork', 'explorer:test')).toMatchObject({
			chainId: 31318,
			url: 'https://rpc-nextfork.devnet.tempoxyz.dev',
		})
		for (const environment of ['nextfork', 'testnet', 'mainnet']) {
			vi.stubEnv('VITE_TEMPO_ENV', environment)
			expect(getChainBackend(31318, 'tidx')).toBeUndefined()
		}
	})

	it('fails closed when an override has no valid credentials', () => {
		serverEnv.DEVNET_RPC_URL = 'https://rpc-my-stack.devnet.tempoxyz.dev'
		expect(() => getExplorerRpcBackend('devnet', 'explorer:test')).toThrow(
			'credentials',
		)
		serverEnv.DEVNET_RPC_AUTH = 'Bearer wrong'
		expect(() => getDevnetBackend('devnet', 'rpc')).toThrow('credentials')
	})
})

describe('resolveTempoApi', () => {
	it('authenticates to the production API with TEMPO_API_KEY', () => {
		expect(resolveTempoApi({ TEMPO_API_KEY: 'prod-key' }, 'devnet')).toEqual({
			url: 'https://api.tempo.xyz',
			headers: { 'tempo-api-key': 'prod-key' },
		})
		expect(resolveTempoApi({}, 'testnet')).toEqual({
			url: 'https://api.tempo.xyz',
			headers: undefined,
		})
	})

	it('never sends the production key to a devnet API override', () => {
		expect(
			resolveTempoApi(
				{
					DEVNET_API_URL: 'https://api-pr-12.example.workers.dev/',
					TEMPO_API_KEY: 'prod-key',
				},
				'devnet',
			),
		).toEqual({
			url: 'https://api-pr-12.example.workers.dev',
			headers: undefined,
		})
	})

	it('adds Cloudflare Access headers only when both values are set', () => {
		const env = {
			DEVNET_API_URL: 'https://api-pr-12.example.workers.dev',
			DEVNET_API_ACCESS_CLIENT_ID: 'client.access',
			DEVNET_API_ACCESS_CLIENT_SECRET: 'secret',
		}
		expect(resolveTempoApi(env, 'devnet').headers).toEqual({
			'CF-Access-Client-Id': 'client.access',
			'CF-Access-Client-Secret': 'secret',
		})
		expect(
			resolveTempoApi(
				{ ...env, DEVNET_API_ACCESS_CLIENT_SECRET: undefined },
				'devnet',
			).headers,
		).toBeUndefined()
	})

	it('ignores the API override outside devnet builds', () => {
		expect(
			resolveTempoApi(
				{
					DEVNET_API_URL: 'https://api-pr-12.example.workers.dev',
					TEMPO_API_KEY: 'prod-key',
				},
				'nextfork',
			),
		).toEqual({
			url: 'https://api.tempo.xyz',
			headers: { 'tempo-api-key': 'prod-key' },
		})
	})
})

describe('devnet chain', () => {
	it('polls /api/rpc instead of the default WebSocket when the RPC is overridden', async () => {
		vi.stubEnv('VITE_DEVNET_RPC_OVERRIDDEN', 'true')
		vi.resetModules()
		const { tempoDevnet } = await import('#lib/chains')
		expect(tempoDevnet.rpcUrls.default).toEqual({
			http: ['https://rpc.devnet.tempoxyz.dev'],
		})
	})

	it('keeps the default WebSocket otherwise', async () => {
		vi.resetModules()
		const { tempoDevnet } = await import('#lib/chains')
		expect(tempoDevnet.rpcUrls.default.webSocket).toEqual([
			'wss://rpc.devnet.tempoxyz.dev',
		])
	})
})
