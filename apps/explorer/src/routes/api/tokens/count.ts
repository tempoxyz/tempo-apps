import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { getChainId } from 'wagmi/actions'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { getWagmiConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const EVENT_SIGNATURE =
	'event TokenCreated(address indexed token, uint256 indexed tokenId, string name, string symbol, string currency, address quoteToken, address admin)'

export const Route = createFileRoute('/api/tokens/count')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const config = getWagmiConfig()
					const chainId = getChainId(config)

					const countResult = await QB.selectFrom(
						QB.withSignatures([EVENT_SIGNATURE])
							.selectFrom('tokencreated')
							.select((eb) => eb.lit(1).as('x'))
							.where('chain', '=', chainId)
							.limit(TOKEN_COUNT_MAX)
							.as('subquery'),
					)
						.select((eb) => eb.fn.count('x').as('count'))
						.executeTakeFirst()

					const count = Number(countResult?.count ?? 0)

					return Response.json({ data: count, error: null })
				} catch (error) {
					console.error(error)
					const errorMessage = error instanceof Error ? error.message : error
					return Response.json(
						{ data: null, error: errorMessage },
						{ status: 500 },
					)
				}
			},
		},
	},
})
