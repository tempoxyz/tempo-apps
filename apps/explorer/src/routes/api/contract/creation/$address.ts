import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { getChainId, getPublicClient } from 'wagmi/actions'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

export const Route = createFileRoute('/api/contract/creation/$address')({
	server: {
		handlers: {
			GET: async ({ params }: { params: { address: string } }) => {
				try {
					const address = zAddress().parse(params.address)
					Address.assert(address)

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
						0n,
						latestBlock,
					)

					if (creationBlock === null) {
						return Response.json({ creation: null, error: null })
					}

					const block = await client.getBlock({ blockNumber: creationBlock })

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
	client: ReturnType<typeof getPublicClient>,
	address: Address.Address,
	low: bigint,
	high: bigint,
): Promise<bigint | null> {
	if (!client) return null

	while (low < high) {
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

	const finalCode = await client.getCode({
		address,
		blockNumber: low,
	})

	if (finalCode && finalCode !== '0x') {
		return low
	}

	return null
}
