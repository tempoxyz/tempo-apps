import { createServerFn } from '@tanstack/react-start'
import { Address } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { formatUnits } from 'viem'
import { getChainId, readContract } from 'wagmi/actions'
import * as z from 'zod/mini'

import { config, getConfig } from '#wagmi.config.ts'

const INDEX_SUPPLY_ENDPOINT = 'https://api.indexsupply.net/v2/query'

const TotalValueInputSchema = z.object({
	address: z.pipe(
		z.string(),
		z.transform((value) => {
			const normalized = value.toLowerCase() as Address.Address
			Address.assert(normalized)
			return normalized
		}),
	),
})

const indexSupplyResponseSchema = z.array(
	z.object({
		cursor: z.string(),
		columns: z.array(
			z.object({
				name: z.string(),
				pgtype: z.enum(['bytea', 'numeric']),
			}),
		),
		rows: z.array(z.tuple([z.string(), z.string()])),
	}),
)

export type AccountTotalValueResult = { totalValue: number }

export const fetchAccountTotalValue = createServerFn({ method: 'POST' })
	.inputValidator((input) => TotalValueInputSchema.parse(input))
	.handler(async ({ data }) => {
		const apiKey = process.env.INDEXSUPPLY_API_KEY
		if (!apiKey) throw new Error('INDEXSUPPLY_API_KEY is not configured')

		const chainId = getChainId(config)
		const searchParams = new URLSearchParams({
			query: /* sql */ `SELECT address as token_address,
			SUM(CASE WHEN "to" = '${data.address}' THEN tokens ELSE 0 END) -
			SUM(CASE WHEN "from" = '${data.address}' THEN tokens ELSE 0 END) as balance
			FROM transfer
			WHERE chain = ${chainId} AND ("to" = '${data.address}' OR "from" = '${data.address}')
			GROUP BY address`,
			signatures:
				'Transfer(address indexed from, address indexed to, uint tokens)',
			'api-key': apiKey,
		})

		const response = await fetch(
			`${INDEX_SUPPLY_ENDPOINT}?${searchParams.toString()}`,
		)

		if (!response.ok) {
			const text = await response.text()
			throw new Error(text || 'Failed to fetch total value')
		}

		const responseData = await response.json()
		const parsed = indexSupplyResponseSchema.safeParse(responseData)
		if (!parsed.success) throw new Error(z.prettifyError(parsed.error))

		const rowsWithBalance =
			parsed.data.at(0)?.rows.filter(([_, balance]) => BigInt(balance) > 0n) ??
			[]

		const decimals =
			(await Promise.all(
				rowsWithBalance.map(([tokenAddress]) =>
					readContract(getConfig(), {
						address: tokenAddress as Address.Address,
						abi: Abis.tip20,
						functionName: 'decimals',
					}),
				),
			)) ?? []

		const decimalsMap = new Map<Address.Address, number>(
			decimals.map((decimal, index) => [
				rowsWithBalance[index][0] as Address.Address,
				decimal,
			]),
		)

		const PRICE_PER_TOKEN = 1 // TODO: fetch actual price per token

		const totalValue = rowsWithBalance
			.map(([tokenAddress, balance]) => {
				const tokenDecimals =
					decimalsMap.get(tokenAddress as Address.Address) ?? 0
				return Number(formatUnits(BigInt(balance), tokenDecimals))
			})
			.reduce((acc, balance) => acc + balance * PRICE_PER_TOKEN, 0)

		return { totalValue }
	})
