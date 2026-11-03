import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseAbiItem, toEventSelector } from 'viem'
import { zonePortalBatchSubmittedEvents } from '#lib/abis'
import { SUBMIT_BATCH_SELECTORS } from '#lib/server/address-history'
import { fetchZonePortalActivity } from '#lib/server/zone-portal'
import { zoneProverBatchLog } from './fixtures/zone-prover-batch'

describe('Zone Portal batch signatures', () => {
	it('covers the pre-T13 and T13 BatchSubmitted topics, oldest first', () => {
		expect(zonePortalBatchSubmittedEvents.map(toEventSelector)).toEqual([
			'0x5a66941dc92cb865480c966eff640c02b1d00d544b74332fd67c6f1cbfccdf39',
			zoneProverBatchLog.topics[0],
		])
	})

	it('hides both pre-T13 and T13 submitBatch calls', () => {
		expect(SUBMIT_BATCH_SELECTORS).toEqual(['0x78fb159b', '0x4cd6c7c7'])
	})
})

describe('fetchZonePortalActivity batches', () => {
	const legacyTopic = toEventSelector(zonePortalBatchSubmittedEvents[0])
	// 3 pre-T13 batches (0..2) then 2 T13 batches (3..4), newest first.
	const batches = { legacy: [2, 1, 0], t13: [4, 3] }

	afterEach(() => vi.unstubAllGlobals())

	it('pages newest first across the T13 signature change', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (request: Request) => {
				const url = new URL(request.url)
				const signature = url.searchParams
					.getAll('signature')
					.find((s) => s.startsWith('BatchSubmitted('))
				const era =
					signature &&
					toEventSelector(parseAbiItem(`event ${signature}`)) === legacyTopic
						? 'legacy'
						: 't13'
				const query = url.searchParams.get('sql') ?? ''
				if (/count\(/i.test(query))
					return Response.json({
						columns: ['count'],
						rows: [[batches[era].length]],
						row_count: 1,
						ok: true,
					})
				const limit = Number(/limit (\d+)/i.exec(query)?.[1] ?? 10)
				const offset = Number(/offset (\d+)/i.exec(query)?.[1] ?? 0)
				const rows = batches[era]
					.slice(offset, offset + limit)
					.map((index) => [
						1_700_000_000 + index,
						`0x${index.toString(16).padStart(64, '0')}`,
						String(index),
						'1',
						`0x${'11'.repeat(32)}`,
						String(index),
					])
				return Response.json({
					columns: [
						'block_timestamp',
						'tx_hash',
						'withdrawalBatchIndex',
						'withdrawalQueueIndex',
						'withdrawalQueueHash',
						'lastProcessedDepositNumber',
					],
					rows,
					row_count: rows.length,
					ok: true,
				})
			}),
		)
		const pages = await Promise.all(
			[1, 2].map((page) =>
				fetchZonePortalActivity({
					address: '0x5Ad0000000000000000000000000000000000003',
					chainId: 4217,
					kind: 'batches',
					page,
					limit: 3,
				}),
			),
		)
		expect(pages.map((p) => p.total)).toEqual([5, 5])
		expect(
			pages.map((p) =>
				p.items.map((item) => (item as { batchIndex: string }).batchIndex),
			),
		).toEqual([
			['4', '3', '2'],
			['1', '0'],
		])
	})
})
