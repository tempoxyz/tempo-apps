import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { Abis, Addresses } from 'viem/tempo'
import type { Config } from 'wagmi'
import { getChainId, readContracts } from 'wagmi/actions'
import { Actions } from 'wagmi/tempo'
import { hasIndexSupply } from '#lib/env'
import { getWagmiConfig } from '#wagmi.config'

export type FeeAmmPoolRow = {
	poolId: `0x${string}`
	userToken: Address.Address
	validatorToken: Address.Address
	createdAt: number | null
	createdTxHash: `0x${string}`
	latestMintAt: number | null
	latestMintTxHash: `0x${string}`
	mintCount: number
}

export type FeeAmmPool = FeeAmmPoolRow & {
	reserveUserToken: bigint
	reserveValidatorToken: bigint
	totalSupply: bigint
	userTokenSymbol?: string | undefined
	userTokenName?: string | undefined
	userTokenDecimals?: number | undefined
	validatorTokenSymbol?: string | undefined
	validatorTokenName?: string | undefined
	validatorTokenDecimals?: number | undefined
}

type TokenMetadata = {
	name?: string | undefined
	symbol?: string | undefined
	decimals?: number | undefined
}

function parsePoolReserves(result: unknown): {
	reserveUserToken: bigint
	reserveValidatorToken: bigint
} {
	if (Array.isArray(result)) {
		const reserveUserToken = result[0] as bigint | number | string | undefined
		const reserveValidatorToken = result[1] as
			| bigint
			| number
			| string
			| undefined
		return {
			reserveUserToken: BigInt(reserveUserToken ?? 0),
			reserveValidatorToken: BigInt(reserveValidatorToken ?? 0),
		}
	}

	if (result && typeof result === 'object') {
		const pool = result as {
			reserveUserToken?: bigint
			reserveValidatorToken?: bigint
		}
		return {
			reserveUserToken: pool.reserveUserToken ?? 0n,
			reserveValidatorToken: pool.reserveValidatorToken ?? 0n,
		}
	}

	return {
		reserveUserToken: 0n,
		reserveValidatorToken: 0n,
	}
}

async function fetchTokenMetadata(
	config: Config,
	token: Address.Address,
): Promise<TokenMetadata> {
	try {
		const metadata = await Actions.token.getMetadata(config, { token })
		return {
			name: metadata.name,
			symbol: metadata.symbol,
			decimals: metadata.decimals,
		}
	} catch {
		return {}
	}
}

export const fetchFeeAmmPools = createServerFn({ method: 'POST' }).handler(
	async (): Promise<FeeAmmPool[]> => {
		if (!hasIndexSupply()) return []

		try {
			const config = getWagmiConfig()
			const chainId = getChainId(config)
			const { fetchFeeAmmPoolRows } = await import(
				'#lib/server/fee-amm-pool-rows'
			)
			const pools = await fetchFeeAmmPoolRows(chainId)

			if (pools.length === 0) return []

			const tokenAddresses = Array.from(
				new Set(pools.flatMap((pool) => [pool.userToken, pool.validatorToken])),
			) as Address.Address[]

			const tokenMetadataEntries = await Promise.all(
				tokenAddresses.map(
					async (token) =>
						[token, await fetchTokenMetadata(config as Config, token)] as const,
				),
			)

			const tokenMetadata = new Map<Address.Address, TokenMetadata>(
				tokenMetadataEntries,
			)

			const contractResults = await readContracts(config, {
				contracts: pools.flatMap((pool) => [
					{
						address: Addresses.feeManager,
						abi: Abis.feeAmm,
						functionName: 'getPool',
						args: [pool.userToken, pool.validatorToken],
					},
					{
						address: Addresses.feeManager,
						abi: Abis.feeAmm,
						functionName: 'totalSupply',
						args: [pool.poolId],
					},
				]),
			})

			return pools
				.map((pool, index) => {
					const reservesResult = contractResults[index * 2]?.result
					const totalSupplyResult = contractResults[index * 2 + 1]?.result
					const reserves = parsePoolReserves(reservesResult)
					const userTokenMetadata = tokenMetadata.get(pool.userToken)
					const validatorTokenMetadata = tokenMetadata.get(pool.validatorToken)

					return {
						...pool,
						reserveUserToken: reserves.reserveUserToken,
						reserveValidatorToken: reserves.reserveValidatorToken,
						totalSupply:
							typeof totalSupplyResult === 'bigint'
								? totalSupplyResult
								: BigInt(totalSupplyResult ?? 0),
						userTokenName: userTokenMetadata?.name,
						userTokenSymbol: userTokenMetadata?.symbol,
						userTokenDecimals: userTokenMetadata?.decimals,
						validatorTokenName: validatorTokenMetadata?.name,
						validatorTokenSymbol: validatorTokenMetadata?.symbol,
						validatorTokenDecimals: validatorTokenMetadata?.decimals,
					}
				})
				.sort((a, b) => {
					const aTimestamp = a.latestMintAt ?? a.createdAt ?? 0
					const bTimestamp = b.latestMintAt ?? b.createdAt ?? 0
					return bTimestamp - aTimestamp
				})
		} catch (error) {
			console.error('Failed to fetch Fee AMM pools:', error)
			return []
		}
	},
)
