import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import * as IDX from 'idxs'
import type { Address } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { formatUnits } from 'viem'
import { readContract } from 'wagmi/actions'

import { zAddress } from '#lib/zod.ts'
import { config, getConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

export const Route = createFileRoute('/api/address/total-value/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const address = zAddress().parse(params.address)
				const chainId = config.getClient().chain.id

				const result = await QB.withSignatures([TRANSFER_SIGNATURE])
					.selectFrom('transfer')
					.select(['address', 'from', 'to', 'tokens'])
					.where('chain', '=', chainId)
					.where((eb) =>
						eb.or([eb('from', '=', address), eb('to', '=', address)]),
					)
					.execute()

				// Calculate balance per token
				const balances = new Map<string, bigint>()
				for (const row of result) {
					const tokenAddress = String(row.address)
					const from = String(row.from).toLowerCase()
					const to = String(row.to).toLowerCase()
					const tokens = BigInt(row.tokens)
					const addressLower = address.toLowerCase()

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

				const decimals =
					(await Promise.all(
						rowsWithBalance.map((row) =>
							// TODO: use readContracts when multicall is not broken
							readContract(getConfig(), {
								address: row.token_address as Address.Address,
								abi: Abis.tip20,
								functionName: 'decimals',
							}),
						),
					)) ?? []

				const decimalsMap = new Map<Address.Address, number>(
					decimals.map((decimal, index) => [
						rowsWithBalance[index].token_address as Address.Address,
						decimal,
					]),
				)

				const PRICE_PER_TOKEN = 1 // TODO: fetch actual price per token

				const totalValue = rowsWithBalance
					.map((row) => {
						const tokenDecimals =
							decimalsMap.get(row.token_address as Address.Address) ?? 0
						return Number(formatUnits(row.balance, tokenDecimals))
					})
					.reduce((acc, balance) => acc + balance * PRICE_PER_TOKEN, 0)

				return json({ totalValue })
			},
		},
	},
})
