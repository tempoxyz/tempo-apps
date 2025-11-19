import { createServerFn } from '@tanstack/react-start'
import { Address } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { formatUnits } from 'viem'
import { getChainId, readContract } from 'wagmi/actions'
import * as z from 'zod/mini'
import { env } from '#lib/env.ts'
import { config, getConfig } from '#wagmi.config.ts'

const TotalValueInputSchema = z.object({
	address: z.pipe(
		z.string(),
		z.transform((value) => {
			Address.assert(value)
			return value
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
	.inputValidator(TotalValueInputSchema)
	.handler(async ({ data }) => {
		const chainId = getChainId(config)
		const address = data.address.toLowerCase() as Address.Address

		const searchParams = new URLSearchParams({
			query: /* sql */ `SELECT address as token_address,
			SUM(CASE WHEN "to" = '${address}' THEN tokens ELSE 0 END) -
			SUM(CASE WHEN "from" = '${address}' THEN tokens ELSE 0 END) as balance
			FROM transfer
			WHERE chain = ${chainId} AND ("to" = '${address}' OR "from" = '${address}')
			GROUP BY address`,
			signatures:
				'Transfer(address indexed from, address indexed to, uint tokens)',
			'api-key': env.server.INDEXSUPPLY_API_KEY,
		})

		const response = await fetch(
			`${env.server.INDEXSUPPLY_ENDPOINT}?${searchParams.toString()}`,
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
