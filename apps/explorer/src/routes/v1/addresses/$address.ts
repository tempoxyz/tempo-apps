import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { Address, Hex } from 'ox'
import { formatUnits } from 'viem'
import { Abis } from 'viem/tempo'
import { getChainId, multicall } from 'wagmi/actions'
import type { AddressInfo } from '../_types'
import {
	badRequest,
	corsPreflightResponse,
	jsonResponse,
	serverError,
} from '../_utils'
import { hasIndexSupply } from '#lib/env'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const KNOWN_TOKENS = [
	'0x20c0000000000000000000000000000000000000',
	'0x20c0000000000000000000000000000000000001',
	'0x20c0000000000000000000000000000000000002',
	'0x20c0000000000000000000000000000000000003',
] as const

export const Route = createFileRoute('/v1/addresses/$address')({
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
					const chainId = getChainId(config)

					if (!hasIndexSupply()) {
						const emptyInfo: AddressInfo = {
							address,
							transactionCount: 0,
							totalValue: 0,
							firstActivityBlock: null,
							lastActivityBlock: null,
						}
						return jsonResponse(emptyInfo)
					}

					const [txCountResult, activityResult, tokenBalancesResult] =
						await Promise.all([
							Promise.all([
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
							]),
							Promise.all([
								QB.selectFrom('txs')
									.select(['block_num'])
									.where('chain', '=', chainId)
									.where((eb) =>
										eb.or([eb('from', '=', address), eb('to', '=', address)]),
									)
									.orderBy('block_num', 'asc')
									.limit(1)
									.executeTakeFirst(),
								QB.selectFrom('txs')
									.select(['block_num'])
									.where('chain', '=', chainId)
									.where((eb) =>
										eb.or([eb('from', '=', address), eb('to', '=', address)]),
									)
									.orderBy('block_num', 'desc')
									.limit(1)
									.executeTakeFirst(),
							]),
							multicall(config, {
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
										functionName: 'decimals',
									},
								]),
							}),
						])

					const txSent = Number(txCountResult[0]?.cnt ?? 0)
					const txReceived = Number(txCountResult[1]?.cnt ?? 0)
					const transactionCount = txSent + txReceived

					const firstActivityBlock = activityResult[0]?.block_num ?? null
					const lastActivityBlock = activityResult[1]?.block_num ?? null

					let totalValue = 0
					for (let i = 0; i < KNOWN_TOKENS.length; i++) {
						const balanceResult = tokenBalancesResult[i * 2]
						const decimalsResult = tokenBalancesResult[i * 2 + 1]
						const balance = balanceResult?.result as bigint | undefined
						const decimals = (decimalsResult?.result ?? 18) as number
						if (balance && balance > 0n) {
							totalValue += Number(formatUnits(balance, decimals))
						}
					}

					const info: AddressInfo = {
						address,
						transactionCount,
						totalValue,
						firstActivityBlock: firstActivityBlock?.toString() ?? null,
						lastActivityBlock: lastActivityBlock?.toString() ?? null,
					}

					return jsonResponse(info)
				} catch (error) {
					console.error('Address info error:', error)
					return serverError('Failed to fetch address info')
				}
			},
		},
	},
})
