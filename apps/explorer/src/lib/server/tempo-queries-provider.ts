import { QB, Tidx } from 'tidx.ts'
import { serverEnv, tempoApiUrl } from './env'
import { getTempoEnv } from '#lib/env'
import { getZoneProverTarget } from './network'
import { ZONE_PROVER_CHAIN_ID } from '#lib/zone-prover'

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
	if (getTempoEnv() === 'zone-prover') {
		if (chainId !== ZONE_PROVER_CHAIN_ID)
			throw new Error('Wrong chain for prover indexer')
		const target = getZoneProverTarget('tidx')
		return QB.from({
			...Tidx.create({ baseUrl: target.url, headers: target.headers }),
			chainId,
			...options,
		})
	}
	return QB.from({ ...tidx, chainId, ...options })
}

export { tidx }
