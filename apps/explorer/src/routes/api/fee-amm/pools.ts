import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { Abis, Addresses } from 'viem/tempo'
import { getChainId, readContracts } from 'wagmi/actions'
import tokensIndex31318 from '#data/tokens-index-31318.json' with {
	type: 'json',
}
import tokensIndex42431 from '#data/tokens-index-42431.json' with {
	type: 'json',
}
import tokensIndex4217 from '#data/tokens-index-4217.json' with { type: 'json' }
import { fetchFeeAmmPoolPairs } from '#lib/server/tempo-queries'
import { getTokenListEntries } from '#lib/server/tokens'
import { getWagmiConfig } from '#wagmi.config'

type TokenIndexEntry = [address: `0x${string}`, symbol: string, name: string]

export type FeeAmmToken = {
	address: string
	name: string
	symbol: string
	decimals?: number
}

export type FeeAmmPool = {
	userToken: string
	validatorToken: string
	reserveUserToken: string
	reserveValidatorToken: string
}

export type FeeAmmPoolsResponse = {
	pools: FeeAmmPool[]
	tokens: FeeAmmToken[]
}

const TOKEN_INDEX_BY_CHAIN_ID: Record<number, readonly TokenIndexEntry[]> = {
	31318: tokensIndex31318 as TokenIndexEntry[],
	42431: tokensIndex42431 as TokenIndexEntry[],
	4217: tokensIndex4217 as TokenIndexEntry[],
}

function normalizeTokenText(value: string | undefined): string | undefined {
	const normalized = value?.trim()
	return normalized ? normalized : undefined
}

function getTokenIndexMetadataByAddress(chainId: number) {
	return new Map(
		(TOKEN_INDEX_BY_CHAIN_ID[chainId] ?? []).map(([address, symbol, name]) => [
			address.toLowerCase(),
			{ symbol, name },
		]),
	)
}

export const Route = createFileRoute('/api/fee-amm/pools')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const [tokenListEntries, discoveredPairs] = await Promise.all([
						getTokenListEntries(chainId),
						fetchFeeAmmPoolPairs(chainId),
					])

					if (discoveredPairs.length === 0) {
						return Response.json(
							{ pools: [], tokens: [] } satisfies FeeAmmPoolsResponse,
							{
								headers: { 'Cache-Control': 'public, max-age=60' },
							},
						)
					}

					const tokenListMetadataByAddress = new Map(
						tokenListEntries
							.filter((entry) => Address.validate(entry.address))
							.map((entry) => [entry.address.toLowerCase(), entry]),
					)
					const candidateTokenAddresses = [
						...new Set([
							...tokenListMetadataByAddress.keys(),
							...discoveredPairs.flatMap((pair) => [
								pair.userToken.toLowerCase(),
								pair.validatorToken.toLowerCase(),
							]),
						]),
					].filter((address) =>
						Address.validate(address),
					) as Array<`0x${string}`>
					const candidatePairs = new Map<
						string,
						{ userToken: `0x${string}`; validatorToken: `0x${string}` }
					>()

					for (const userToken of candidateTokenAddresses) {
						for (const validatorToken of candidateTokenAddresses) {
							if (userToken === validatorToken) continue

							candidatePairs.set(`${userToken}:${validatorToken}`, {
								userToken,
								validatorToken,
							})
						}
					}

					for (const pair of discoveredPairs) {
						candidatePairs.set(
							`${pair.userToken.toLowerCase()}:${pair.validatorToken.toLowerCase()}`,
							{
								userToken: pair.userToken,
								validatorToken: pair.validatorToken,
							},
						)
					}

					const pairs = [...candidatePairs.values()]
					const tokenIndexMetadataByAddress =
						getTokenIndexMetadataByAddress(chainId)

					const results = await readContracts(config, {
						contracts: pairs.map((pair) => ({
							address: Addresses.feeManager,
							abi: Abis.feeAmm,
							functionName: 'getPool' as const,
							args: [pair.userToken, pair.validatorToken] as const,
						})),
					})

					const pools: FeeAmmPool[] = []
					for (let index = 0; index < pairs.length; index++) {
						const result = results[index]
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
							userToken: pairs[index].userToken,
							validatorToken: pairs[index].validatorToken,
							reserveUserToken: pool.reserveUserToken.toString(),
							reserveValidatorToken: pool.reserveValidatorToken.toString(),
						})
					}

					const uniqueTokenAddresses = [
						...new Set(
							pools.flatMap((pool) => [
								pool.userToken.toLowerCase(),
								pool.validatorToken.toLowerCase(),
							]),
						),
					]
						.filter((address) => Address.validate(address))
						.map((address) => address as `0x${string}`)
					const tokens = uniqueTokenAddresses.map((address) => {
						const tokenListEntry = tokenListMetadataByAddress.get(
							address.toLowerCase(),
						)
						const tokenIndexEntry = tokenIndexMetadataByAddress.get(
							address.toLowerCase(),
						)

						return {
							address,
							name:
								normalizeTokenText(tokenListEntry?.name) ??
								normalizeTokenText(tokenIndexEntry?.name) ??
								address,
							symbol:
								normalizeTokenText(tokenListEntry?.extensions?.label) ??
								normalizeTokenText(tokenListEntry?.symbol) ??
								normalizeTokenText(tokenIndexEntry?.symbol) ??
								normalizeTokenText(tokenIndexEntry?.name) ??
								address,
							decimals: tokenListEntry?.decimals,
						}
					})

					return Response.json(
						{ pools, tokens } satisfies FeeAmmPoolsResponse,
						{
							headers: {
								'Cache-Control':
									'public, max-age=300, stale-while-revalidate=600',
							},
						},
					)
				} catch (error) {
					console.error('[fee-amm/pools]', error)
					return Response.json(
						{ pools: [], tokens: [], error: 'Internal server error' },
						{ status: 500 },
					)
				}
			},
		},
	},
})
