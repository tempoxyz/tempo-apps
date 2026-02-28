import * as IDX from 'idxs'

const tempoQuery = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const tempoQueryBuilder = IDX.QueryBuilder.from(tempoQuery)

export { tempoQuery, tempoQueryBuilder }
