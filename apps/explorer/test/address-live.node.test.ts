import { describe, expect, it } from 'vitest'
import { readSse, mergeLiveRows } from '../src/lib/sse'
import { buildLiveQueries, liveQuerySchema } from '../src/lib/live-query'
const address = '0x20c000000000000000000000b9537d11c60e8b50'
describe('address live streams', () => {
	it('parses chunked CRLF frames, multiline data and lag notifications', async () => {
		const bytes = new TextEncoder().encode(
			': heartbeat\r\n\r\nevent: rows\r\ndata: {"rows":\r\ndata: []}\r\n\r\nevent: lagged\ndata: {"skipped":2}\n\n',
		)
		const stream = new ReadableStream<Uint8Array>({
			start(c) {
				for (const byte of bytes) c.enqueue(new Uint8Array([byte]))
				c.close()
			},
		})
		const frames = []
		for await (const frame of readSse(stream)) frames.push(frame)
		expect(frames).toEqual([
			{ event: 'rows', data: '{"rows":\n[]}' },
			{ event: 'lagged', data: '{"skipped":2}' },
		])
	})
	it('cancels the reader on disconnect', async () => {
		let cancelled = false
		const stream = new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(new TextEncoder().encode('event: rows\ndata: []\n\n'))
			},
			cancel() {
				cancelled = true
			},
		})
		for await (const _frame of readSse(stream)) break
		expect(cancelled).toBe(true)
	})
	it('deduplicates reconnect snapshots and preserves distinct logs', () => {
		const old = [
			{ id: 'a-1', blockNumber: '100' },
			{ id: 'a-0', blockNumber: '100' },
		]
		const fresh = [{ id: 'b-0', blockNumber: '101' }, ...old]
		expect(mergeLiveRows(old, fresh, (row) => row.id, 3)).toEqual(fresh)
		expect(mergeLiveRows(fresh, fresh, (row) => row.id, 2)).toEqual(
			fresh.slice(0, 2),
		)
	})
	it('rejects invalid addresses and unbounded limits', () => {
		expect(
			liveQuerySchema.safeParse({
				address: "x' OR 1=1",
				kind: 'token-transfers',
			}).success,
		).toBe(false)
		expect(
			liveQuerySchema.safeParse({
				address,
				kind: 'token-transfers',
				limit: 10000,
			}).success,
		).toBe(false)
		const query = buildLiveQueries(
			liveQuerySchema.parse({ address, kind: 'token-transfers', limit: 10 }),
		)[0]
		expect(query).toContain(`address = '${address}'`)
		expect(query).toContain('topic0 =')
		expect(query).toContain('LIMIT 10')
	})
	it('uses separate indexed sides and honors direction', () => {
		expect(
			buildLiveQueries(
				liveQuerySchema.parse({ address, kind: 'account-transfers' }),
			),
		).toHaveLength(2)
		expect(
			buildLiveQueries(
				liveQuerySchema.parse({
					address,
					kind: 'account-transfers',
					direction: 'in',
				}),
			)[0],
		).toContain('topic2 =')
		expect(
			buildLiveQueries(
				liveQuerySchema.parse({
					address,
					kind: 'transactions',
					include: 'sent',
				}),
			)[0],
		).toContain(`"from" = '${address}'`)
	})
})
