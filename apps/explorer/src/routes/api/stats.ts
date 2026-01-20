import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { getBlock } from 'wagmi/actions'
import { getChainId } from 'wagmi/actions'
import { hasIndexSupply } from '#lib/env'
import { getWagmiConfig } from '#wagmi.config'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const SECONDS_IN_24H = 24 * 60 * 60
const BLOCKS_TO_CHECK_24H = 500

export const Route = createFileRoute('/api/stats')({
	server: {
		handlers: {
			GET: async () => {
				const config = getWagmiConfig()
				const chainId = getChainId(config)

				let totalTransactions = 0
				let transactions24h = 0
				let totalAccounts = 0
				let accounts24h = 0

				if (hasIndexSupply()) {
					try {
						const totalTxResult = await QB.selectFrom('txs')
							.select((eb) => eb.fn.count('hash').as('cnt'))
							.where('chain', '=', chainId)
							.executeTakeFirst()

						totalTransactions = Number(totalTxResult?.cnt ?? 0)
					} catch (error) {
						console.error('Failed to fetch total transactions:', error)
					}

					try {
						const uniqueFromResult = await QB.selectFrom('txs')
							.select('from')
							.distinct()
							.where('chain', '=', chainId)
							.limit(100_000)
							.execute()

						totalAccounts = uniqueFromResult.length
					} catch (error) {
						console.error('Failed to fetch total accounts:', error)
					}
				}

				try {
					const latestBlock = await getBlock(config)
					const now = Math.floor(Date.now() / 1000)
					const timestamp24hAgo = now - SECONDS_IN_24H

					const blockNumbers: bigint[] = []
					for (let i = 0n; i < BigInt(BLOCKS_TO_CHECK_24H); i++) {
						const blockNum = latestBlock.number - i
						if (blockNum >= 0n) blockNumbers.push(blockNum)
					}

					const blocks = await Promise.all(
						blockNumbers.map((blockNumber) =>
							getBlock(config, {
								blockNumber,
								includeTransactions: true,
							}).catch(() => null),
						),
					)

					const uniqueAccountsIn24h = new Set<string>()
					let txCount24h = 0

					for (const block of blocks) {
						if (!block || Number(block.timestamp) < timestamp24hAgo) continue
						txCount24h += block.transactions.length
						for (const tx of block.transactions) {
							if (typeof tx !== 'string') {
								uniqueAccountsIn24h.add(tx.from.toLowerCase())
							}
						}
					}

					transactions24h = txCount24h
					accounts24h = uniqueAccountsIn24h.size
				} catch (error) {
					console.error('Failed to fetch 24h stats:', error)
				}

				return Response.json({
					data: {
						totalTransactions,
						transactions24h,
						totalAccounts,
						accounts24h,
					},
					error: null,
				})
			},
		},
	},
})
