import { QB, Tidx } from 'tidx.ts'

const tidx = Tidx.create({
	basicAuth: process.env.TIDX_BASIC_AUTH,
	baseUrl: process.env.TIDX_URL || 'https://tidx.tempo.xyz',
})

export function tempoQueryBuilder(chainId: number) {
	return QB.from({ ...tidx, chainId })
}

export { tidx }
