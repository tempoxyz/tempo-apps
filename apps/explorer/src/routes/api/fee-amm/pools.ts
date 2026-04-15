import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { Abis, Addresses } from 'viem/tempo'
import { getChainId, readContracts } from 'wagmi/actions'
import { getTokenListAddresses } from '#lib/server/tokens'
import { getWagmiConfig } from '#wagmi.config'

export type FeeAmmPool = {
	userToken: string
	validatorToken: string
	reserveUserToken: string
	reserveValidatorToken: string
}

export type FeeAmmPoolsResponse = {
	pools: FeeAmmPool[]
}

const MAX_TOKENS = 32

export const Route = createFileRoute('/api/fee-amm/pools')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const addressSet = await getTokenListAddresses(chainId)
					const tokenAddresses = [...addressSet]
						.filter((a) => Address.validate(a))
						.slice(0, MAX_TOKENS) as `0x${string}`[]

					if (tokenAddresses.length === 0) {
						return Response.json({ pools: [] } satisfies FeeAmmPoolsResponse, {
							headers: { 'Cache-Control': 'public, max-age=60' },
						})
					}

					const pairs: Array<{
						userToken: `0x${string}`
						validatorToken: `0x${string}`
					}> = []
					for (const a of tokenAddresses) {
						for (const b of tokenAddresses) {
							if (a.toLowerCase() !== b.toLowerCase()) {
								pairs.push({ userToken: a, validatorToken: b })
							}
						}
					}

					const results = await readContracts(config, {
						contracts: pairs.map((pair) => ({
							address: Addresses.feeManager,
							abi: Abis.feeAmm,
							functionName: 'getPool' as const,
							args: [pair.userToken, pair.validatorToken] as const,
						})),
					})

					const pools: FeeAmmPool[] = []
					for (let i = 0; i < pairs.length; i++) {
						const result = results[i]
						if (result.status !== 'success' || !result.result) continue

						const pool = result.result as {
							reserveUserToken: bigint
							reserveValidatorToken: bigint
						}
						if (
							pool.reserveUserToken === 0n &&
							pool.reserveValidatorToken === 0n
						) {
							continue
						}

						pools.push({
							userToken: pairs[i].userToken,
							validatorToken: pairs[i].validatorToken,
							reserveUserToken: pool.reserveUserToken.toString(),
							reserveValidatorToken: pool.reserveValidatorToken.toString(),
						})
					}

					return Response.json({ pools } satisfies FeeAmmPoolsResponse, {
						headers: {
							'Cache-Control':
								'public, max-age=300, stale-while-revalidate=600',
						},
					})
				} catch (error) {
					console.error('[fee-amm/pools]', error)
					return Response.json(
						{ pools: [], error: 'Internal server error' },
						{ status: 500 },
					)
				}
			},
		},
	},
})
