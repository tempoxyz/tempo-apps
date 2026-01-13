import { getChainId } from 'wagmi/actions'
import { getQueryBuilder } from '#lib/server/idx.server.ts'
import { getWagmiConfig } from '#wagmi.config.ts'

const isTestnet = process.env.VITE_TEMPO_ENV === 'testnet'

export async function fetchLatestBlockImpl() {
	if (!isTestnet) return
	try {
		const config = getWagmiConfig()
		const chainId = getChainId(config)

		const QB = await getQueryBuilder()
		const result = await QB.selectFrom('blocks')
			.select('num')
			.where('chain', '=', chainId)
			.orderBy('num', 'desc')
			.limit(1)
			.executeTakeFirstOrThrow()

		return BigInt(result.num)
	} catch (error) {
		console.error('Failed to fetch latest block:', error)
		return undefined
	}
}
