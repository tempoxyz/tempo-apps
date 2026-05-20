import { env } from 'cloudflare:workers'
import { request } from 'node:https'

const MAX_CLICKHOUSE_RESPONSE_BYTES = 16 * 1024 * 1024

type MemorySnapshot = {
	rss: number
	heapUsed: number
}

function memorySnapshot(): MemorySnapshot | undefined {
	if (typeof process === 'undefined' || !process.memoryUsage) return undefined
	const { rss, heapUsed } = process.memoryUsage()
	return { rss, heapUsed }
}

function mib(bytes: number): number {
	return Math.round(bytes / 1024 / 1024)
}

function httpsPost(
	url: URL,
	headers: Record<string, string>,
	body: string,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = request(url, { method: 'POST', headers }, (res) => {
			const chunks: Array<Buffer> = []
			let bytes = 0
			res.on('data', (chunk: Buffer) => {
				bytes += chunk.byteLength
				if (bytes > MAX_CLICKHOUSE_RESPONSE_BYTES) {
					req.destroy(
						new Error(
							`ClickHouse response exceeded ${MAX_CLICKHOUSE_RESPONSE_BYTES} bytes`,
						),
					)
					return
				}
				chunks.push(chunk)
			})
			res.on('error', reject)
			res.on('end', () => {
				const text = Buffer.concat(chunks).toString()
				if (res.statusCode && res.statusCode >= 400) {
					reject(new Error(`ClickHouse ${res.statusCode}: ${text}`))
				} else {
					resolve(text)
				}
			})
		})
		req.on('error', reject)
		req.write(body)
		req.end()
	})
}

function clickHouseUrl(host: string): URL {
	const trimmedHost = host.trim()
	const url = /^https?:\/\//i.test(trimmedHost)
		? new URL(trimmedHost)
		: new URL(`https://${trimmedHost}`)

	url.searchParams.set('default_format', 'JSON')
	return url
}

export async function queryClickHouse<T>(
	query: string,
	label = 'query',
): Promise<Array<T>> {
	const {
		CLICKHOUSE_HOST,
		CLICKHOUSE_USER,
		CLICKHOUSE_PASSWORD,
		CLICKHOUSE_DATABASE,
	} = env

	if (!CLICKHOUSE_HOST || !CLICKHOUSE_USER || !CLICKHOUSE_PASSWORD) {
		console.warn('[clickhouse] missing credentials, returning empty')
		return []
	}

	const url = clickHouseUrl(CLICKHOUSE_HOST)
	if (CLICKHOUSE_DATABASE) {
		url.searchParams.set('database', CLICKHOUSE_DATABASE)
	}

	const startedAt = performance.now()
	const before = memorySnapshot()
	const text = await httpsPost(
		url,
		{
			'X-ClickHouse-User': CLICKHOUSE_USER,
			'X-ClickHouse-Key': CLICKHOUSE_PASSWORD,
		},
		query,
	)

	const result = JSON.parse(text) as { data: Array<T> }
	const after = memorySnapshot()
	console.info('[clickhouse] query complete', {
		label,
		rows: result.data.length,
		responseMiB: mib(Buffer.byteLength(text)),
		durationMs: Math.round(performance.now() - startedAt),
		rssMiB: after ? mib(after.rss) : undefined,
		heapUsedMiB: after ? mib(after.heapUsed) : undefined,
		heapDeltaMiB:
			before && after ? mib(after.heapUsed - before.heapUsed) : undefined,
	})
	return result.data
}
