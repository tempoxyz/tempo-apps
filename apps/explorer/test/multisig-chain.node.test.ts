import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tempoMultisig } from '#lib/chains'
import { tempoEnvSchema } from '#lib/build-env'
import { getActiveExplorerNetworkOption } from '#lib/explorer-network'
import { isNonIndexableExplorerHost } from '#lib/explorer-indexing'
import { MULTISIG_EXPLORER_URL, MULTISIG_RPC_URL } from '#lib/multisig'
import { getChainBackend, getExplorerRpcBackend } from '#lib/server/network'
import { api } from '#lib/server/tempo-api'

afterEach(() => {
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
})

describe('multisig devnet isolation', () => {
	it('uses chain 31318 with a dedicated explorer endpoint', () => {
		expect(tempoMultisig.id).toBe(31318)
		expect(tempoMultisig.rpcUrls.default).toEqual({
			http: [`${MULTISIG_EXPLORER_URL}/api/rpc`],
		})
		expect(tempoMultisig.blockExplorers.default.url).toBe(MULTISIG_EXPLORER_URL)
		expect(tempoEnvSchema.parse('multisig1')).toBe('multisig1')
		expect(getActiveExplorerNetworkOption('multisig1').label).toBe('Multisig')
	})
	it('routes multisig separately from other chain 31318 networks', () => {
		const auth = 'explorer:test-credential'
		expect(getExplorerRpcBackend('multisig1', auth)).toEqual({
			chainId: 31318,
			url: MULTISIG_RPC_URL,
			headers: { Authorization: `Basic ${btoa(auth)}` },
		})
		expect(getExplorerRpcBackend('devnet', auth).url).not.toBe(MULTISIG_RPC_URL)
		expect(getExplorerRpcBackend('nextfork', auth).url).not.toBe(
			MULTISIG_RPC_URL,
		)
	})
	it('rejects shared indexing and other-chain backends in the multisig build', () => {
		vi.stubEnv('VITE_TEMPO_ENV', 'multisig1')
		expect(() => getChainBackend(31318, 'tidx')).toThrow(
			'Indexed history is not available for multisig1',
		)
		expect(() => getChainBackend(31319, 'rpc')).toThrow(
			'Multisig explorer chain does not match',
		)
	})
	it('does not change ordinary devnet indexer selection', () => {
		vi.stubEnv('VITE_TEMPO_ENV', 'devnet')
		expect(getChainBackend(31318, 'tidx')).toBeUndefined()
	})
	it('uses runtime multisig credentials for direct server RPC reads', () => {
		vi.stubEnv('VITE_TEMPO_ENV', 'multisig1')
		vi.stubEnv('RPC_AUTH', 'explorer:multisig-secret')
		expect(getChainBackend(31318, 'rpc')).toEqual({
			chainId: 31318,
			url: MULTISIG_RPC_URL,
			headers: { Authorization: `Basic ${btoa('explorer:multisig-secret')}` },
		})
	})
	it('blocks shared API calls without contacting regular-devnet backends', async () => {
		vi.stubEnv('VITE_TEMPO_ENV', 'multisig1')
		const upstream = vi.fn()
		vi.stubGlobal('fetch', upstream)
		const response = await api.v1['verified-tokens'].$get({
			query: { chainId: '31318' },
		})
		expect(response.status).toBe(503)
		expect(await response.json()).toEqual({
			error: 'Shared API data is not available for multisig1',
		})
		expect(upstream).not.toHaveBeenCalled()
	})
	it('has a public custom domain, required credentials, and no search indexing', () => {
		const config = JSON.parse(
			readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'),
		).env.multisig1
		expect(config.name).toBe('explorer-multisig1')
		expect(config.vars.VITE_TEMPO_ENV).toBe('multisig1')
		expect(config.secrets.required).toEqual(['RPC_AUTH'])
		expect(config.workers_dev).toBe(true)
		expect(config.routes).toEqual([
			{
				custom_domain: true,
				zone_name: 'tempo.xyz',
				pattern: new URL(MULTISIG_EXPLORER_URL).hostname,
			},
		])
		expect(
			isNonIndexableExplorerHost(new URL(MULTISIG_EXPLORER_URL).hostname),
		).toBe(true)
		expect(
			isNonIndexableExplorerHost(
				'preview-explorer-multisig1.example.workers.dev',
			),
		).toBe(true)
	})
	it('passes the multisig environment to the deploy command without deploying', () => {
		const result = spawnSync(
			'bash',
			[
				'-c',
				'exec() { printf "%s\\n" "$CLOUDFLARE_ENV" "$VITE_TEMPO_ENV" "$@"; }; source scripts/deploy.sh --env multisig1',
			],
			{ env: { PATH: process.env.PATH }, encoding: 'utf8' },
		)
		expect(result.status).toBe(0)
		expect(result.stdout.trim().split('\n')).toEqual([
			'multisig1',
			'multisig1',
			'wrangler',
			'deploy',
			'--env',
			'multisig1',
		])
	})
})
