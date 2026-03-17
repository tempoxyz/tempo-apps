import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import type * as Hex from 'ox/Hex'
import { getTransactionReceipt } from 'viem/actions'
import { getChainId, getPublicClient } from 'wagmi/actions'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

type CreationData = {
	blockNumber: bigint
	timestamp: bigint
	hash: Hex.Hex | null
	from: Address.Address | null
	to: Address.Address | null
	value: bigint | null
	status: 'success' | 'reverted' | null
	gasUsed: bigint | null
	effectiveGasPrice: bigint | null
}

type CreationTxData = {
	hash: Hex.Hex
	from: Address.Address
	to: Address.Address | null
	value: bigint
	status: 'success' | 'reverted'
	gasUsed: bigint
	effectiveGasPrice: bigint | null
}

const MAX_CREATION_CACHE_SIZE = 1000
const creationCache = new Map<string, CreationData>()

function serializeCreation(creation: CreationData) {
	return {
		blockNumber: creation.blockNumber.toString(),
		timestamp: creation.timestamp.toString(),
		hash: creation.hash,
		from: creation.from,
		to: creation.to,
		value: creation.value?.toString() ?? null,
		status: creation.status,
		gasUsed: creation.gasUsed?.toString() ?? null,
		effectiveGasPrice: creation.effectiveGasPrice?.toString() ?? null,
	}
}

export const Route = createFileRoute('/api/contract/creation/$address')({
	server: {
		handlers: {
			GET: async ({ params }: { params: { address: string } }) => {
				try {
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const cacheKey = `${chainId}:${address.toLowerCase()}`

					const cached = creationCache.get(cacheKey)
					if (cached) {
						return Response.json({
							creation: serializeCreation(cached),
							error: null,
						})
					}

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

					const block = await client.getBlock({
						blockNumber: creationBlock,
						includeTransactions: true,
					})
					const creationTx = await findCreationTxInBlock(
						client,
						address,
						block.transactions,
					)

					const creation = {
						blockNumber: creationBlock,
						timestamp: block.timestamp,
						hash: creationTx?.hash ?? null,
						from: creationTx?.from ?? null,
						to: creationTx?.to ?? null,
						value: creationTx?.value ?? null,
						status: creationTx?.status ?? null,
						gasUsed: creationTx?.gasUsed ?? null,
						effectiveGasPrice: creationTx?.effectiveGasPrice ?? null,
					} satisfies CreationData

					if (creationCache.size >= MAX_CREATION_CACHE_SIZE) {
						const firstKey = creationCache.keys().next().value
						if (firstKey) creationCache.delete(firstKey)
					}
					creationCache.set(cacheKey, creation)

					return Response.json({
						creation: serializeCreation(creation),
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

async function findCreationTxInBlock(
	client: NonNullable<ReturnType<typeof getPublicClient>>,
	address: Address.Address,
	transactions: readonly {
		hash: Hex.Hex
		to: Address.Address | null
		from: Address.Address
		value: bigint
	}[],
): Promise<CreationTxData | null> {
	// Filter to contract creation txs (to === null) to avoid N+1 receipt fetches
	const candidates = transactions.filter((tx) => tx.to === null)
	if (candidates.length === 0) return null

	const receipts = await Promise.all(
		candidates.map(async (tx) => {
			try {
				const receipt = await getTransactionReceipt(client, {
					hash: tx.hash,
				})
				return { receipt, tx }
			} catch {
				return null
			}
		}),
	)

	for (const result of receipts) {
		if (!result?.receipt.contractAddress) continue
		if (!Address.isEqual(result.receipt.contractAddress, address)) continue

		return {
			hash: result.receipt.transactionHash,
			from: result.receipt.from,
			to: result.receipt.to,
			value: result.tx.value,
			status: result.receipt.status,
			gasUsed: result.receipt.gasUsed,
			effectiveGasPrice: result.receipt.effectiveGasPrice ?? null,
		}
	}

	return null
}

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
