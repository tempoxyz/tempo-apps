import { QB, Tidx } from 'tidx.ts'

const tidx = Tidx.create({
	basicAuth: process.env.TIDX_BASIC_AUTH,
	baseUrl: 'https://tidx.tempo.xyz',
})

tidx.on('response', (res) => {
	if (!res.ok)
		res
			.clone()
			.text()
			.then((body) =>
				console.error(
					`[tidx:${res.status}]`,
					decodeURIComponent(res.url),
					body,
					`(auth=${process.env.TIDX_BASIC_AUTH ? 'set' : 'missing'})`,
				),
			)
})

export function tempoQueryBuilder(chainId: number) {
	return QB.from({ ...tidx, chainId })
}

export function tempoFastLookupQueryBuilder(chainId: number) {
	return QB.from({ ...tidx, chainId, engine: 'clickhouse' })
}

export { tidx }
