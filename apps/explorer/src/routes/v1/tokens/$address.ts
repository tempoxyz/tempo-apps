import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { Address } from 'ox'
import { Abis } from 'viem/tempo'
import { getChainId, readContract } from 'wagmi/actions'
import type { TokenInfo } from '../_types'
import {
	badRequest,
	corsPreflightResponse,
	jsonResponse,
	notFound,
	serverError,
} from '../_utils'
import * as ABIS from '#lib/abis'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

export const Route = createFileRoute('/v1/tokens/$address')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async ({ params }) => {
				try {
					const parseResult = zAddress().safeParse(params.address)
					if (!parseResult.success) {
						return badRequest('Invalid address format')
					}
					const address = parseResult.data
					Address.assert(address)

					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const eventSignature = ABIS.getTokenCreatedEvent(chainId)

					const tokenResult = await QB.withSignatures([eventSignature])
						.selectFrom('tokencreated')
						.select(['token', 'symbol', 'name', 'currency', 'block_timestamp'])
						.where('chain', '=', chainId as never)
						.where('token', '=', address.toLowerCase())
						.executeTakeFirst()

					if (!tokenResult) {
						const [symbol, name, decimals] = await Promise.all([
							readContract(config, {
								address,
								abi: Abis.tip20,
								functionName: 'symbol',
							}).catch(() => null),
							readContract(config, {
								address,
								abi: Abis.tip20,
								functionName: 'name',
							}).catch(() => null),
							readContract(config, {
								address,
								abi: Abis.tip20,
								functionName: 'decimals',
							}).catch(() => null),
						])

						if (!symbol && !name) {
							return notFound('Token not found')
						}

						return jsonResponse({
							address,
							symbol: symbol ?? 'UNKNOWN',
							name: name ?? 'Unknown Token',
							currency: 'USD',
							createdAt: 0,
						} satisfies TokenInfo)
					}

					const token: TokenInfo = {
						address: tokenResult.token,
						symbol: tokenResult.symbol,
						name: tokenResult.name,
						currency: tokenResult.currency,
						createdAt: Number(tokenResult.block_timestamp),
					}

					return jsonResponse(token)
				} catch (error) {
					console.error('Token info error:', error)
					return serverError('Failed to fetch token info')
				}
			},
		},
	},
})
