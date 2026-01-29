import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { getChainId, getPublicClient } from 'wagmi/actions'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const creationCache = new Map<
	string,
	{ blockNumber: bigint; timestamp: bigint }
>()

export const Route = createFileRoute('/api/contract/creation/$address')({
	server: {
		handlers: {
			GET: async ({ params }: { params: { address: string } }) => {
				try {
					const address = zAddress().parse(params.address)
					Address.assert(address)
					const cacheKey = address.toLowerCase()

					const cached = creationCache.get(cacheKey)
					if (cached) {
						return Response.json({
							creation: {
								blockNumber: cached.blockNumber.toString(),
								timestamp: cached.timestamp.toString(),
							},
							error: null,
						})
					}

					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const client = getPublicClient(config, { chainId })

					if (!client) {
						return Response.json(
							{ creation: null, error: 'No client available' },
							{ status: 500 },
						)
					}

					const bytecode = await client.getCode({ address })
					if (!bytecode || bytecode === '0x') {
						return Response.json({ creation: null, error: null })
					}

					const latestBlock = await client.getBlockNumber()
					const creationBlock = await binarySearchCreationBlock(
						client,
						address,
						1n,
						latestBlock,
					)

					if (creationBlock === null) {
						return Response.json({ creation: null, error: null })
					}

					const block = await client.getBlock({ blockNumber: creationBlock })

					creationCache.set(cacheKey, {
						blockNumber: creationBlock,
						timestamp: block.timestamp,
					})

					return Response.json({
						creation: {
							blockNumber: creationBlock.toString(),
							timestamp: block.timestamp.toString(),
						},
						error: null,
					})
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : error
					console.error('[contract/creation] Error:', errorMessage)
					return Response.json(
						{ creation: null, error: errorMessage },
						{ status: 500 },
					)
				}
			},
		},
	},
})

async function binarySearchCreationBlock(
	client: NonNullable<ReturnType<typeof getPublicClient>>,
	address: Address.Address,
	low: bigint,
	high: bigint,
): Promise<bigint | null> {
	const MAX_BATCH_SIZE = 10

	while (high - low > BigInt(MAX_BATCH_SIZE)) {
		const mid = (low + high) / 2n

		try {
			const code = await client.getCode({
				address,
				blockNumber: mid,
			})

			if (code && code !== '0x') {
				high = mid
			} else {
				low = mid + 1n
			}
		} catch {
			low = mid + 1n
		}
	}

	const blocksToCheck = []
	for (let b = low; b <= high; b++) {
		blocksToCheck.push(b)
	}

	const results = await Promise.all(
		blocksToCheck.map(async (blockNum) => {
			try {
				const code = await client.getCode({
					address,
					blockNumber: blockNum,
				})
				return { blockNum, hasCode: Boolean(code && code !== '0x') }
			} catch {
				return { blockNum, hasCode: false }
			}
		}),
	)

	for (const result of results) {
		if (result.hasCode) {
			return result.blockNum
		}
	}

	return null
}
