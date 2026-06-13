import { QB, Tidx } from 'tidx.ts'
import { serverEnv } from './env'

const tidx = Tidx.create({
	baseUrl: `${serverEnv.TEMPO_API_URL.replace(/\/$/, '')}/v1/indexer`,
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
				),
			)
})

export function tempoQueryBuilder(chainId: number) {
	return QB.from({ ...tidx, chainId })
}

export { tidx }
