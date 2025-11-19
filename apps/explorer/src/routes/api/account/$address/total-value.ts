import { createFileRoute } from '@tanstack/react-router'
import { Address } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { formatUnits } from 'viem'
import { getChainId, readContract } from 'wagmi/actions'
import * as z from 'zod/mini'
import { config, getConfig } from '#wagmi.config.ts'

export const Route = createFileRoute('/api/account/$address/total-value')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const address = params.address.toLowerCase() as Address.Address

				const chainId = getChainId(config)

				const searchParams = new URLSearchParams({
					query: /* sql */ `SELECT address as token_address, SUM(CASE WHEN "to" = '${address}' THEN tokens ELSE 0 END) - SUM(CASE WHEN "from" = '${address}' THEN tokens ELSE 0 END) as balance FROM transfer WHERE chain = ${chainId} AND ("to" = '${address}' OR "from" = '${address}') GROUP BY address`,
					signatures:
						'Transfer(address indexed from, address indexed to, uint tokens)',
					'api-key': process.env.INDEXSUPPLY_API_KEY,
				})

				const response = await fetch(
					`https://api.indexsupply.net/v2/query?${searchParams.toString()}`,
				)

				if (!response.ok) {
					const text = await response.text()
					console.error(text)
					return Response.json(
						{ error: 'Failed to fetch total value', cause: text },
						{ status: response.status },
					)
				}
				const responseData = await response.json()

				const result = z
					.array(
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
					.safeParse(responseData)

				if (!result.success)
					return Response.json(
						{ error: z.prettifyError(result.error) },
						{ status: response.status },
					)

				const rowsWithBalance =
					result.data
						.at(0)
						?.rows.filter(([_, balance]) => BigInt(balance) > 0n) ?? []

				const decimals =
					(await Promise.all(
						rowsWithBalance.map(([address]) =>
							// TODO: use readContracts when multicall is not broken
							readContract(getConfig(), {
								address: address as Address.Address,
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
					.map(([address, balance]) => {
						const tokenDecimals =
							decimalsMap.get(address as Address.Address) ?? 0
						return Number(formatUnits(BigInt(balance), tokenDecimals))
					})
					.reduce((acc, balance) => acc + balance * PRICE_PER_TOKEN, 0)

				console.info('totalValue', totalValue)
				return Response.json({ totalValue }, { status: 200 })
			},
		},
	},
	params: {
		parse: z.object({
			address: z.pipe(
				z.string(),
				z.transform((x) => {
					Address.assert(x)
					return x
				}),
			),
		}).parse,
	},
})
