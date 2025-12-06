import * as IDX from 'idxs'
import { config } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})
const QB = IDX.QueryBuilder.from(IS)

const EVENT_SIGNATURE =
	'event TokenCreated(address indexed token, uint256 indexed tokenId, string name, string symbol, string currency, address quoteToken, address admin)'

const tokens = await QB.withSignatures([EVENT_SIGNATURE])
	.selectFrom('tokencreated')
	.select(['token', 'symbol', 'name', 'currency', 'block_timestamp'])
	.where('chain', '=', config.getClient().chain.id)
	.limit(10)
	.offset(0)
	.execute()

console.info(tokens)
