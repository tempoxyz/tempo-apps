import { createFileRoute } from '@tanstack/react-router'
import { Address } from 'ox'
import { Abis } from 'viem/tempo'
import { multicall } from 'wagmi/actions'
import type { TokenBalance } from '../../_types'
import {
	badRequest,
	corsPreflightResponse,
	jsonResponse,
	serverError,
} from '../../_utils'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const KNOWN_TOKENS = [
	'0x20c0000000000000000000000000000000000000',
	'0x20c0000000000000000000000000000000000001',
	'0x20c0000000000000000000000000000000000002',
	'0x20c0000000000000000000000000000000000003',
] as const

export const Route = createFileRoute('/v1/addresses/balances/$address')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async ({ params }) => {
				try {
					const parseResult = zAddress().safeParse(params.address)
					if (!parseResult.success) {
						return badRequest('Invalid address format')
					}
					const address = parseResult.data
					Address.assert(address)

					const config = getWagmiConfig()

					const results = await multicall(config, {
						contracts: KNOWN_TOKENS.flatMap((token) => [
							{
								address: token,
								abi: Abis.tip20,
								functionName: 'balanceOf',
								args: [address],
							},
							{
								address: token,
								abi: Abis.tip20,
								functionName: 'symbol',
							},
							{
								address: token,
								abi: Abis.tip20,
								functionName: 'name',
							},
							{
								address: token,
								abi: Abis.tip20,
								functionName: 'decimals',
							},
						]),
					})

					const balances: TokenBalance[] = []
					for (let i = 0; i < KNOWN_TOKENS.length; i++) {
						const baseIndex = i * 4
						const balance = results[baseIndex]?.result as bigint | undefined
						const symbol = results[baseIndex + 1]?.result as string | undefined
						const name = results[baseIndex + 2]?.result as string | undefined
						const decimals = (results[baseIndex + 3]?.result ?? 18) as number

						if (balance && balance > 0n) {
							balances.push({
								token: KNOWN_TOKENS[i],
								symbol: symbol ?? null,
								name: name ?? null,
								decimals,
								balance: balance.toString(),
							})
						}
					}

					return jsonResponse(balances)
				} catch (error) {
					console.error('Address balances error:', error)
					return serverError('Failed to fetch address balances')
				}
			},
		},
	},
})
