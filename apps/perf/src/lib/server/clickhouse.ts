import { env } from 'cloudflare:workers'
import { request } from 'node:https'

function httpsPost(
	url: URL,
	headers: Record<string, string>,
	body: string,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = request(url, { method: 'POST', headers }, (res) => {
			const chunks: Array<Buffer> = []
			res.on('data', (chunk: Buffer) => chunks.push(chunk))
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

export async function queryClickHouse<T>(query: string): Promise<Array<T>> {
	const { CLICKHOUSE_HOST, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD } = env

	if (!CLICKHOUSE_HOST || !CLICKHOUSE_USER || !CLICKHOUSE_PASSWORD) {
		console.warn('[clickhouse] missing credentials, returning empty')
		return []
	}

	const url = new URL(`https://${CLICKHOUSE_HOST}/?default_format=JSON`)

	const text = await httpsPost(
		url,
		{
			'X-ClickHouse-User': CLICKHOUSE_USER,
			'X-ClickHouse-Key': CLICKHOUSE_PASSWORD,
		},
		query,
	)

	const result = JSON.parse(text) as { data: Array<T> }
	return result.data
}
