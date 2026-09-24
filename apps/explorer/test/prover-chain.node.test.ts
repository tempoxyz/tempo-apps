import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tempoZoneProver } from '#lib/chains'
import { getFeeTokenForChain } from '#lib/fee-token'
import { buildZonePortalOgUrl } from '#lib/og-params'
import { getChainBackend } from '#lib/server/network'
import { serverEnv } from '#lib/server/env'
import { forwardProverRpc } from '#lib/server/prover-rpc'
import { ZONE_PROVER_RPC_URL, ZONE_PROVER_TIDX_URL } from '#lib/zone-prover'

vi.mock('#lib/server/env', () => ({ serverEnv: {} }))
afterEach(() => {
	delete serverEnv.ZONE_PROVER_RPC_AUTH
	delete serverEnv.ZONE_PROVER_TIDX_AUTH
	vi.unstubAllGlobals()
})

describe('prover chain routing', () => {
	it('does not request portal activity for unsupported renderer networks', () => {
		expect(
			buildZonePortalOgUrl('https://og.tempo.xyz', '0x1234', 'zone-prover'),
		).not.toContain('/zone-portal/')
		expect(
			buildZonePortalOgUrl('https://og.tempo.xyz', '0x1234', 'devnet'),
		).toContain('network=devnet')
	})
	it('uses a distinct chain and matching fee token', () => {
		expect(tempoZoneProver.id).toBe(31319)
		expect(getFeeTokenForChain(31319)).toBe(tempoZoneProver.feeToken)
	})
	it('leaves existing chains on their existing backends', () => {
		for (const id of [31318, 4217, 42431])
			expect(getChainBackend(id, 'rpc')).toBeUndefined()
	})
	it('fails closed without valid server credentials', () => {
		expect(() => getChainBackend(31319, 'rpc')).toThrow('credentials')
		serverEnv.ZONE_PROVER_TIDX_AUTH = 'Bearer wrong'
		expect(() => getChainBackend(31319, 'tidx')).toThrow('credentials')
	})
	it('selects independent fixed RPC and TIDX targets', () => {
		serverEnv.ZONE_PROVER_RPC_AUTH = 'Basic cnBjOnRlc3Q='
		serverEnv.ZONE_PROVER_TIDX_AUTH = 'Basic dGlkeDp0ZXN0'
		expect(getChainBackend(31319, 'rpc')).toEqual({
			url: ZONE_PROVER_RPC_URL,
			headers: { Authorization: serverEnv.ZONE_PROVER_RPC_AUTH },
		})
		expect(getChainBackend(31319, 'tidx')).toEqual({
			url: ZONE_PROVER_TIDX_URL,
			headers: { Authorization: serverEnv.ZONE_PROVER_TIDX_AUTH },
		})
	})
	it('forwards read batches with server credentials', async () => {
		const upstream = vi.fn().mockResolvedValue(new Response('[]'))
		vi.stubGlobal('fetch', upstream)
		const body = JSON.stringify([
			{ jsonrpc: '2.0', id: 1, method: 'eth_chainId' },
		])
		expect(
			(
				await forwardProverRpc(
					new Request('https://example.invalid/api/rpc', {
						method: 'POST',
						body,
					}),
					'Basic cnBjOnRlc3Q=',
				)
			).status,
		).toBe(200)
		expect(upstream).toHaveBeenCalledWith(
			ZONE_PROVER_RPC_URL,
			expect.objectContaining({
				body,
				redirect: 'manual',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Basic cnBjOnRlc3Q=',
				},
			}),
		)
	})
	it('rejects writes, malformed JSON and oversized bodies without forwarding', async () => {
		const upstream = vi.fn()
		vi.stubGlobal('fetch', upstream)
		for (const [body, status] of [
			[
				JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction' }),
				400,
			],
			['{', 400],
			['x'.repeat(128 * 1024 + 1), 413],
		] as const)
			expect(
				(
					await forwardProverRpc(
						new Request('https://example.invalid/api/rpc', {
							method: 'POST',
							body,
						}),
						'Basic cnBjOnRlc3Q=',
					)
				).status,
			).toBe(status)
		expect(upstream).not.toHaveBeenCalled()
	})
	it('uses a public custom domain with the same URL settings as nextfork', () => {
		const config = JSON.parse(
			readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'),
		).env
		expect(config['zone-prover'].workers_dev).toBe(true)
		expect(config['zone-prover'].workers_dev).toBe(config.nextfork.workers_dev)
		expect(config['zone-prover'].preview_urls).toBe(
			config.nextfork.preview_urls,
		)
		const prover = config['zone-prover']
		expect(prover.routes).toHaveLength(1)
		expect(prover.routes[0]).toEqual({
			custom_domain: true,
			zone_name: 'tempo.xyz',
			pattern: 'explore.zone-prover.devnet.tempo.xyz',
		})
		expect(tempoZoneProver.blockExplorers.default.url).toBe(
			'https://explore.zone-prover.devnet.tempo.xyz',
		)
	})
	it.each([
		'zone-prover',
		'nextfork',
	])('deploys %s without an acknowledgement flag', (environment) => {
		// Shadow exec to capture arguments; never invoke a real deployment in tests.
		const result = spawnSync(
			'bash',
			[
				'-c',
				'exec() { printf "%s\\n" "$CLOUDFLARE_ENV" "$VITE_TEMPO_ENV" "$@"; }; source scripts/deploy.sh "$@"',
				'deploy-test',
				'--env',
				environment,
			],
			{ env: { PATH: process.env.PATH }, encoding: 'utf8' },
		)
		expect(result.status).toBe(0)
		expect(result.stdout.trim().split('\n')).toEqual([
			environment,
			environment,
			'wrangler',
			'deploy',
			'--env',
			environment,
		])
	})
})
