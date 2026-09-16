import { afterEach, describe, expect, it, vi } from 'vitest'
import { forwardProverRpc } from '#lib/server/prover-rpc'
import { getRpcTarget } from '#routes/api/simulate'
import {
	zoneProverTarget,
	ZONE_PROVER_RPC_URL,
	ZONE_PROVER_TIDX_URL,
} from '#lib/zone-prover'

vi.mock('#lib/env', () => ({ getTempoEnv: () => 'zone-prover' }))
vi.mock('#lib/server/env', () => ({
	serverEnv: {},
	tempoApiUrl: 'https://api.tempo.xyz',
}))
const call = { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }
const request = (body: unknown) =>
	new Request('https://dev-eu-zone-prover-explorer.tail388b2e.ts.net/api/rpc', {
		method: 'POST',
		body: JSON.stringify(body),
	})
afterEach(() => vi.unstubAllGlobals())

describe('prover network isolation', () => {
	it('routes simulations by network and rejects a foreign chain ID', () => {
		expect(getRpcTarget(31318)).toEqual({
			url: ZONE_PROVER_RPC_URL,
			headers: {},
		})
		expect(() => getRpcTarget(4217)).toThrow('Wrong chain')
	})
	it('keeps RPC and indexer on dedicated cluster-only endpoints', () => {
		expect(zoneProverTarget('rpc').url).toBe(ZONE_PROVER_RPC_URL)
		expect(zoneProverTarget('tidx').url).toBe(ZONE_PROVER_TIDX_URL)
		for (const kind of ['rpc', 'tidx'] as const)
			expect(new URL(zoneProverTarget(kind).url).hostname).toMatch(
				/\.tempo-devnet-zone-prover\.svc\.cluster\.local$/,
			)
	})
	it('forwards a batch only to the internal prover RPC', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(Response.json([{ id: 1, result: '0x123' }]))
		vi.stubGlobal('fetch', fetcher)
		const response = await forwardProverRpc(request([call]))
		expect(response.status).toBe(200)
		expect(fetcher).toHaveBeenCalledWith(
			ZONE_PROVER_RPC_URL,
			expect.objectContaining({
				headers: { 'Content-Type': 'application/json' },
				redirect: 'error',
			}),
		)
		expect(response.headers.get('Authorization')).toBeNull()
		expect(response.headers.get('Cache-Control')).toBe('no-store')
	})
	it('does not retry on the standard devnet when the prover is unavailable', async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
		vi.stubGlobal('fetch', fetcher)
		expect((await forwardProverRpc(request(call))).status).toBe(502)
		expect(fetcher).toHaveBeenCalledTimes(1)
	})
	it('rejects write methods, mixed batches and oversized requests before forwarding', async () => {
		const fetcher = vi.fn()
		vi.stubGlobal('fetch', fetcher)
		for (const body of [
			[],
			[call, { ...call, method: 'eth_sendRawTransaction' }],
			{ ...call, method: 'admin_addPeer' },
		])
			expect((await forwardProverRpc(request(body))).status).toBe(400)
		expect(
			(
				await forwardProverRpc(
					request({ ...call, params: ['x'.repeat(140_000)] }),
				)
			).status,
		).toBe(413)
		expect(fetcher).not.toHaveBeenCalled()
	})
})
