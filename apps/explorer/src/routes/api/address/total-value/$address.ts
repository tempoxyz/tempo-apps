import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import type { Address } from 'ox'
import { formatUnits } from 'viem'
import { Abis } from 'viem/tempo'
import { readContract } from 'wagmi/actions'

import { zAddress } from '#lib/zod.ts'
import { config } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

export const Route = createFileRoute('/api/address/total-value/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const address = zAddress().parse(params.address)
					const chainId = config.getClient().chain.id
					const addressLower = address.toLowerCase()

					// Limit to prevent timeouts on addresses with many transfer events
					const MAX_TRANSFERS = 10000

					const result = await QB.withSignatures([TRANSFER_SIGNATURE])
						.selectFrom('transfer')
						.select(['address', 'from', 'to', 'tokens'])
						.where('chain', '=', chainId)
						.where((eb) =>
							eb.or([eb('from', '=', address), eb('to', '=', address)]),
						)
						.limit(MAX_TRANSFERS)
						.execute()

					// Calculate balance per token
					const balances = new Map<string, bigint>()
					for (const row of result) {
						const tokenAddress = String(row.address)
						const from = String(row.from).toLowerCase()
						const to = String(row.to).toLowerCase()
						const tokens = BigInt(row.tokens)

						const currentBalance = balances.get(tokenAddress) ?? 0n
						let newBalance = currentBalance
						if (to === addressLower) {
							newBalance += tokens
						}
						if (from === addressLower) {
							newBalance -= tokens
						}
						balances.set(tokenAddress, newBalance)
					}

					// Filter for positive balances
					const rowsWithBalance = [...balances.entries()]
						.filter(([_, balance]) => balance > 0n)
						.map(([token_address, balance]) => ({ token_address, balance }))

					// Limit contract reads to prevent slow responses (cap at 20 tokens)
					const MAX_TOKENS = 20
					const tokensToFetch = rowsWithBalance.slice(0, MAX_TOKENS)

					const decimals =
						(await Promise.all(
							tokensToFetch.map(
								(row) =>
									readContract(config, {
										address: row.token_address as Address.Address,
										abi: Abis.tip20,
										functionName: 'decimals',
									}).catch(() => 18), // Fallback to 18 decimals on error
							),
						)) ?? []

					const decimalsMap = new Map<Address.Address, number>(
						decimals.map((decimal, index) => [
							tokensToFetch[index].token_address as Address.Address,
							decimal,
						]),
					)

					const PRICE_PER_TOKEN = 1 // TODO: fetch actual price per token

					const totalValue = rowsWithBalance
						.map((row) => {
							const tokenDecimals =
								decimalsMap.get(row.token_address as Address.Address) ?? 18
							return Number(formatUnits(row.balance, tokenDecimals))
						})
						.reduce((acc, balance) => acc + balance * PRICE_PER_TOKEN, 0)

					return Response.json({ totalValue })
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
