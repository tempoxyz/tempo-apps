import { QB, Tidx } from 'tidx.ts'
import { serverEnv, tempoApiUrl } from './env'
import { getChainBackend } from './network'

const tidx = Tidx.create({
	baseUrl: `${tempoApiUrl}/v1/indexer`,
	headers: serverEnv.TEMPO_API_KEY
		? { 'tempo-api-key': serverEnv.TEMPO_API_KEY }
		: undefined,
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

export function tempoQueryBuilder(
	chainId: number,
	options: { engine?: string | undefined } = {},
) {
	const target = getChainBackend(chainId, 'tidx')
	if (target)
		return QB.from({
			...Tidx.create({ baseUrl: target.url, headers: target.headers }),
			chainId,
			...options,
		})
	return QB.from({ ...tidx, chainId, ...options })
}

export { tidx }
