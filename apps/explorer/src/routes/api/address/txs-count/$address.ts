import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import * as Address from 'ox/Address'
import { getBlockNumber, getCode } from 'viem/actions'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { hasIndexSupply } from '#lib/env'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const chainId = getChainId(getWagmiConfig())

const RequestSchema = z.object({
	chainId: z.prefault(z.coerce.number(), chainId),
})

/**
 * Binary search to find the block where a contract was created.
 */
async function findCreationBlock(
	client: ReturnType<ReturnType<typeof getWagmiConfig>['getClient']>,
	address: Address.Address,
	latestBlock: bigint,
): Promise<bigint | null> {
	let low = 0n
	let high = latestBlock
	let result: bigint | null = null

	while (low <= high) {
		const mid = (low + high) / 2n
		try {
			const code = await getCode(client, { address, blockNumber: mid })
			if (code && code !== '0x') {
				result = mid
				high = mid - 1n
			} else {
				low = mid + 1n
			}
		} catch {
			low = mid + 1n
		}
	}

	return result
}

/**
 * Checks if address is a contract (has creation tx that should be counted).
 * Uses binary search for efficient detection.
 */
async function hasContractCreation(
	address: Address.Address,
	_chainId: number,
): Promise<boolean> {
	const config = getWagmiConfig()
	const client = config.getClient()

	// Check if this address has code (is a contract)
	const code = await getCode(client, { address })
	if (!code || code === '0x') return false

	// If it has code, there must be a creation tx
	// Use binary search to confirm and find the block
	const latestBlock = await getBlockNumber(client)
	const creationBlock = await findCreationBlock(client, address, latestBlock)

	return creationBlock !== null
}

export const Route = createFileRoute('/api/address/txs-count/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!hasIndexSupply()) return Response.json({ data: 0, error: null })

				try {
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const parseResult = RequestSchema.safeParse(params)
					if (!parseResult.success)
						return Response.json(
							{ error: z.prettifyError(parseResult.error), data: null },
							{ status: 400 },
						)

					const { chainId } = parseResult.data

					const [txSentResult, txReceivedResult, hasCreation] =
						await Promise.all([
							QB.selectFrom('txs')
								.select((eb) => eb.fn.count('hash').as('cnt'))
								.where('from', '=', address)
								.where('chain', '=', chainId)
								.executeTakeFirst(),
							QB.selectFrom('txs')
								.select((eb) => eb.fn.count('hash').as('cnt'))
								.where('to', '=', address)
								.where('chain', '=', chainId)
								.executeTakeFirst(),
							// Check if this is a contract with a creation tx
							hasContractCreation(address, chainId),
						])

					const txSent = txSentResult?.cnt ?? 0
					const txReceived = txReceivedResult?.cnt ?? 0
					// Add 1 if contract has a creation tx
					const creationCount = hasCreation ? 1 : 0

					return Response.json({
						data: Number(txSent) + Number(txReceived) + creationCount,
						error: null,
					})
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
