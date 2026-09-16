import { afterEach, describe, expect, it, vi } from 'vitest'
import { QB, Tidx } from 'tidx.ts'
import { parseAbiItem, toEventSelector } from 'viem'
import { getZonePortalActivityAbi } from '#lib/abis'
import { zoneProverBatchLog } from './fixtures/zone-prover-batch'

afterEach(() => vi.unstubAllGlobals())

describe('Zone Portal batch query signatures', () => {
	it.each([
		[31319, zoneProverBatchLog.topics[0]],
		[
			31318,
			'0x5a66941dc92cb865480c966eff640c02b1d00d544b74332fd67c6f1cbfccdf39',
		],
		[
			4217,
			'0x5a66941dc92cb865480c966eff640c02b1d00d544b74332fd67c6f1cbfccdf39',
		],
		[
			42431,
			'0x5a66941dc92cb865480c966eff640c02b1d00d544b74332fd67c6f1cbfccdf39',
		],
	])('requests the correct batch event on chain %s', async (chainId, topic) => {
		let requestedUrl: URL | undefined
		vi.stubGlobal(
			'fetch',
			vi.fn(async (request: Request) => {
				requestedUrl = new URL(request.url)
				return Response.json({
					columns: ['count'],
					rows: [[177]],
					row_count: 1,
					ok: true,
				})
			}),
		)
		await QB.from({
			...Tidx.create({ baseUrl: 'https://indexer.example' }),
			chainId,
		})
			.withAbi(getZonePortalActivityAbi(chainId))
			.selectFrom('batchsubmitted')
			.select((eb) => eb.fn.count('tx_hash').as('count'))
			.where('address', '=', zoneProverBatchLog.address)
			.execute()
		expect(requestedUrl?.searchParams.get('chainId')).toBe(String(chainId))
		const signatures = requestedUrl?.searchParams.getAll('signature') ?? []
		const batches = signatures.filter((signature) =>
			signature.startsWith('BatchSubmitted('),
		)
		expect(batches).toHaveLength(1)
		expect(toEventSelector(parseAbiItem(`event ${batches[0]}`))).toBe(topic)
	})
})
