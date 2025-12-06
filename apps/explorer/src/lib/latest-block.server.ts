import { createServerFn } from '@tanstack/react-start'
import * as IDX from 'idxs'
import { config } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

export const fetchLatestBlock = createServerFn({ method: 'GET' }).handler(
	async () => {
		const chainId = config.getClient().chain.id

		const result = await QB.selectFrom('blocks')
			.select('num')
			.where('chain', '=', chainId)
			.orderBy('num', 'desc')
			.limit(1)
			.executeTakeFirstOrThrow()

		return BigInt(result.num)
	},
)
