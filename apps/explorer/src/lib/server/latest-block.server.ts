import { createServerFn } from '@tanstack/react-start'
import * as IDX from 'idxs'
import { getChainId } from 'wagmi/actions'
import { getWagmiConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const isTestnet = process.env.VITE_TEMPO_ENV === 'testnet'

export const fetchLatestBlock = createServerFn({ method: 'GET' }).handler(
	async () => {
		if (!isTestnet) return
		try {
			const config = getWagmiConfig()
			const chainId = getChainId(config)

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
	},
)
