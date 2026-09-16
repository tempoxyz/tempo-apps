import { afterEach, describe, expect, it, vi } from 'vitest'
import { forwardProverRpc } from '#lib/server/prover-rpc'
import { getRpcTarget } from '#routes/api/simulate'
import {
	zoneProverTarget,
	ZONE_PROVER_RPC_URL,
	ZONE_PROVER_TIDX_URL,
} from '#lib/zone-prover'

const auth = `Basic ${btoa('test:test')}`
vi.mock('#lib/env', () => ({ getTempoEnv: () => 'zone-prover' }))
vi.mock('#lib/server/env', () => ({
	serverEnv: { ZONE_PROVER_RPC_AUTH: 'Basic dGVzdDp0ZXN0' },
	tempoApiUrl: 'https://api.tempo.xyz',
}))
const call = { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }
const request = (body: unknown) =>
	new Request('https://explore.zone-prover.devnet.tempo.xyz/api/rpc', {
		method: 'POST',
		body: JSON.stringify(body),
	})
afterEach(() => vi.unstubAllGlobals())

describe('prover network isolation', () => {
	it('routes simulations by network and rejects a foreign chain ID', () => {
		expect(getRpcTarget(31318)).toEqual({
			url: ZONE_PROVER_RPC_URL,
			headers: { Authorization: auth },
		})
		expect(() => getRpcTarget(4217)).toThrow('Wrong chain')
	})
	it('requires credentials and keeps RPC and indexer on dedicated endpoints', () => {
		expect(() => zoneProverTarget('rpc')).toThrow('not configured')
		expect(() => zoneProverTarget('tidx', '')).toThrow('not configured')
		expect(zoneProverTarget('rpc', auth).url).toBe(ZONE_PROVER_RPC_URL)
		expect(zoneProverTarget('tidx', auth).url).toBe(ZONE_PROVER_TIDX_URL)
	})
	it('forwards a batch only to the prover, adding credentials server-side', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(Response.json([{ id: 1, result: '0x123' }]))
		vi.stubGlobal('fetch', fetcher)
		const response = await forwardProverRpc(request([call]), auth)
		expect(response.status).toBe(200)
		expect(fetcher).toHaveBeenCalledWith(
			ZONE_PROVER_RPC_URL,
			expect.objectContaining({
				headers: { 'Content-Type': 'application/json', Authorization: auth },
				redirect: 'error',
			}),
		)
		expect(response.headers.get('Authorization')).toBeNull()
		expect(response.headers.get('Cache-Control')).toBe('no-store')
	})
	it('does not retry on the standard devnet when the prover is unavailable', async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
		vi.stubGlobal('fetch', fetcher)
		expect((await forwardProverRpc(request(call), auth)).status).toBe(502)
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
			expect((await forwardProverRpc(request(body), auth)).status).toBe(400)
		expect(
			(
				await forwardProverRpc(
					request({ ...call, params: ['x'.repeat(140_000)] }),
					auth,
				)
			).status,
		).toBe(413)
		expect(fetcher).not.toHaveBeenCalled()
	})
})
