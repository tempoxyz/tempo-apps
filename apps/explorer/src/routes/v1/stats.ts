import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { getChainId } from 'wagmi/actions'
import { getBlock } from 'wagmi/actions'
import type { ChainStats } from './_types'
import { corsPreflightResponse, jsonResponse, serverError } from './_utils'
import * as ABIS from '#lib/abis'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { getWagmiConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

export const Route = createFileRoute('/v1/stats')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async () => {
				try {
					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const eventSignature = ABIS.getTokenCreatedEvent(chainId)

					const [latestBlock, tokenCountResult] = await Promise.all([
						getBlock(config),
						QB.selectFrom(
							QB.withSignatures([eventSignature])
								.selectFrom('tokencreated')
								.select((eb) => eb.lit(1).as('x'))
								.where('chain', '=', chainId as never)
								.limit(TOKEN_COUNT_MAX)
								.as('subquery'),
						)
							.select((eb) => eb.fn.count('x').as('count'))
							.executeTakeFirst(),
					])

					const stats: ChainStats = {
						latestBlock: latestBlock.number.toString(),
						tokenCount: Number(tokenCountResult?.count ?? 0),
					}

					return jsonResponse(stats)
				} catch (error) {
					console.error('Stats error:', error)
					return serverError('Failed to fetch chain stats')
				}
			},
		},
	},
})
