import { createFileRoute } from '@tanstack/react-router'
import { Hex } from 'ox'
import { getBlock } from 'wagmi/actions'
import * as z from 'zod/mini'
import type { BlockInfo } from '../_types'
import {
	badRequest,
	corsPreflightResponse,
	DEFAULT_LIMIT,
	MAX_LIMIT,
	paginatedResponse,
	serverError,
} from '../_utils'
import { getWagmiConfig } from '#wagmi.config.ts'

const QuerySchema = z.object({
	offset: z.prefault(z.coerce.number(), 0),
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
})

export const Route = createFileRoute('/v1/blocks/')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const queryResult = QuerySchema.safeParse(
						Object.fromEntries(url.searchParams),
					)
					if (!queryResult.success) {
						return badRequest('Invalid query parameters', queryResult.error)
					}

					const query = queryResult.data
					const limit = Math.min(Math.max(query.limit, 1), MAX_LIMIT)
					const offset = Math.max(query.offset, 0)

					const config = getWagmiConfig()
					const latestBlock = await getBlock(config)
					const latestBlockNumber = latestBlock.number

					const startBlock = latestBlockNumber - BigInt(offset)
					const blockNumbers: bigint[] = []
					for (let i = 0n; i < BigInt(limit); i++) {
						const blockNum = startBlock - i
						if (blockNum >= 0n) blockNumbers.push(blockNum)
					}

					const blocks = await Promise.all(
						blockNumbers.map((blockNumber) =>
							getBlock(config, { blockNumber }).catch(() => null),
						),
					)

					const blockInfos: BlockInfo[] = blocks
						.filter((b): b is NonNullable<typeof b> => b !== null)
						.map((block) => ({
							number: block.number.toString(),
							hash: block.hash as Hex.Hex,
							parentHash: block.parentHash as Hex.Hex,
							timestamp: Number(block.timestamp),
							gasUsed: block.gasUsed.toString(),
							gasLimit: block.gasLimit.toString(),
							baseFeePerGas: block.baseFeePerGas?.toString() ?? null,
							transactionCount: block.transactions.length,
						}))

					const total = Number(latestBlockNumber) + 1
					const hasMore = offset + blockInfos.length < total

					return paginatedResponse(blockInfos, {
						total,
						offset: offset + blockInfos.length,
						limit,
						hasMore,
					})
				} catch (error) {
					console.error('Blocks list error:', error)
					return serverError('Failed to fetch blocks')
				}
			},
		},
	},
})
