import { createFileRoute } from '@tanstack/react-router'
import { Hex } from 'ox'
import type { Block } from 'viem'
import { getBlock } from 'wagmi/actions'
import type { BlockInfo } from '../_types'
import {
	badRequest,
	corsPreflightResponse,
	jsonResponse,
	notFound,
	serverError,
} from '../_utils'
import { getWagmiConfig } from '#wagmi.config.ts'

export const Route = createFileRoute('/v1/blocks/$id')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async ({ params }) => {
				try {
					const { id } = params
					const config = getWagmiConfig()

					let block: Block | null = null

					if (Hex.validate(id) && Hex.size(id) === 32) {
						try {
							block = await getBlock(config, { blockHash: id })
						} catch {
							return notFound('Block not found')
						}
					} else {
						const blockNumber = BigInt(id)
						if (blockNumber < 0n) {
							return badRequest('Invalid block number')
						}
						try {
							block = await getBlock(config, { blockNumber })
						} catch {
							return notFound('Block not found')
						}
					}

					if (!block) {
						return notFound('Block not found')
					}

					const info: BlockInfo = {
						number: block.number.toString(),
						hash: block.hash as Hex.Hex,
						parentHash: block.parentHash as Hex.Hex,
						timestamp: Number(block.timestamp),
						gasUsed: block.gasUsed.toString(),
						gasLimit: block.gasLimit.toString(),
						baseFeePerGas: block.baseFeePerGas?.toString() ?? null,
						transactionCount: block.transactions.length,
					}

					return jsonResponse(info)
				} catch (error) {
					console.error('Block info error:', error)
					return serverError('Failed to fetch block info')
				}
			},
		},
	},
})
