import { createFileRoute } from '@tanstack/react-router'
import { getChainId } from 'wagmi/actions'
import * as ABIS from '#lib/abis'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { getQueryBuilder } from '#lib/server/idx.server.ts'
import { getWagmiConfig } from '#wagmi.config.ts'

export const Route = createFileRoute('/api/tokens/count')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const eventSignature = ABIS.getTokenCreatedEvent(chainId)

					const QB = await getQueryBuilder()
					const countResult = await QB.selectFrom(
						QB.withSignatures([eventSignature])
							.selectFrom('tokencreated')
							.select((eb) => eb.lit(1).as('x'))
							.where('chain', '=', chainId as never)
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
