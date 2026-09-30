import { createServerFn } from '@tanstack/react-start'
import { type InferResponseType, parseResponse } from 'hono/client'
import type { Address } from 'ox'
import {
	encodeAbiParameters,
	formatUnits,
	keccak256,
	pad,
	toEventSelector,
} from 'viem'
import { Addresses } from 'viem/tempo'
import { Abis } from '#lib/abis'
import { getChainId } from 'wagmi/actions'
import { api } from '#lib/server/tempo-api'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'
import { parseTimestamp } from '#lib/timestamp'
import { feeAmmSearchSchema, type FeeAmmSearch } from '#lib/fee-amm'
import { getBatchedClient, getWagmiConfig } from '#wagmi.config'

export type FeeAmmPool = {
	poolId: `0x${string}`
	userToken: Address.Address
	validatorToken: Address.Address
	createdAt: number | null
	latestMintAt: number | null
	mintCount: number
	reserveUserToken: bigint | null
	reserveValidatorToken: bigint | null
	liquidityUsd: number | null
	userTokenSymbol: string
	userTokenName: string
	userTokenDecimals: number
	validatorTokenSymbol: string
	validatorTokenName: string
	validatorTokenDecimals: number
}

export type FeeAmmPage = { pools: FeeAmmPool[]; hasMore: boolean }

type PoolsResponse = InferResponseType<
	(typeof api.v1)['fee-amm']['pools']['$get'],
	200
>

/** Preserve the API's page order; unknown reserves must not look like zero. */
export function mapFeeAmmPools(pools: PoolsResponse['data']): FeeAmmPool[] {
	return pools.map((pool) => ({
		poolId: pool.poolId,
		userToken: pool.userToken.address,
		validatorToken: pool.validatorToken.address,
		createdAt: parseTimestamp(pool.createdAt) ?? null,
		latestMintAt: parseTimestamp(pool.lastMintAt) ?? null,
		mintCount: pool.mintCount,
		reserveUserToken: pool.userAmount
			? BigInt(pool.userAmount.baseUnits)
			: null,
		reserveValidatorToken: pool.validatorAmount
			? BigInt(pool.validatorAmount.baseUnits)
			: null,
		liquidityUsd:
			pool.userAmount &&
			pool.validatorAmount &&
			pool.userToken.currency === 'USD' &&
			pool.validatorToken.currency === 'USD'
				? Number(pool.userAmount.formatted) +
					Number(pool.validatorAmount.formatted)
				: null,
		userTokenName: pool.userToken.name,
		userTokenSymbol: pool.userToken.symbol,
		userTokenDecimals: pool.userToken.decimals,
		validatorTokenName: pool.validatorToken.name,
		validatorTokenSymbol: pool.validatorToken.symbol,
		validatorTokenDecimals: pool.validatorToken.decimals,
	}))
}

const mintTopics = [
	toEventSelector('Mint(address,address,address,address,uint256,uint256)'),
	toEventSelector('Mint(address,address,address,uint256,uint256,uint256)'),
]

/** Filter before pagination, including either side of a directional pool. */
export function tokenPoolQuery(
	chainId: number,
	input: FeeAmmSearch & { token: Address.Address },
) {
	const topic = pad(input.token.toLowerCase() as Address.Address)
	return tempoQueryBuilder(chainId, { engine: 'clickhouse' })
		.selectFrom('logs')
		.select(['topic2', 'topic3'])
		.select((eb) => [
			eb.fn.countAll().as('mintCount'),
			eb.fn.min('block_timestamp').as('createdAt'),
			eb.fn.max('block_timestamp').as('lastMintAt'),
		])
		.where(
			'address',
			'=',
			Addresses.feeManager.toLowerCase() as Address.Address,
		)
		.where('selector', 'in', mintTopics)
		.where((eb) => eb.or([eb('topic2', '=', topic), eb('topic3', '=', topic)]))
		.groupBy(['topic2', 'topic3'])
		.orderBy('mintCount', 'desc')
		.orderBy('topic2', 'desc')
		.orderBy('topic3', 'desc')
		.limit(input.limit + 1)
		.offset((input.page - 1) * input.limit)
}

export async function getFeeAmmPools(input: FeeAmmSearch): Promise<FeeAmmPage> {
	const chainId = getChainId(getWagmiConfig())
	if (!input.token) {
		const page = await parseResponse(
			api.v1['fee-amm'].pools.$get({
				query: {
					chainId: String(chainId),
					page: String(input.page),
					limit: String(input.limit),
				},
			}),
		)
		return {
			pools: mapFeeAmmPools(page.data),
			hasMore: page.nextCursor !== null,
		}
	}

	// The pool-list API has no token filter. Use the existing authenticated
	// indexer provider so token views never scan or filter the global first page.
	const rows = await tokenPoolQuery(chainId, {
		...input,
		token: input.token,
	}).execute()
	const pairs = rows.slice(0, input.limit).map((row) => ({
		...row,
		userToken: `0x${String(row.topic2).slice(-40)}` as Address.Address,
		validatorToken: `0x${String(row.topic3).slice(-40)}` as Address.Address,
	}))
	const client = getBatchedClient()
	const tokens = [
		...new Set(pairs.flatMap((pair) => [pair.userToken, pair.validatorToken])),
	]
	const metadata = new Map(
		await Promise.all(
			tokens.map(
				async (token) =>
					[token, await client.token.getMetadata({ token })] as const,
			),
		),
	)
	const pools = await Promise.all(
		pairs.map(async (pair): Promise<FeeAmmPool> => {
			const user = metadata.get(pair.userToken)
			const validator = metadata.get(pair.validatorToken)
			if (!user || !validator)
				throw new Error('Pool token metadata unavailable')
			const reserve = await client
				.readContract({
					address: Addresses.feeManager,
					abi: Abis.feeAmm,
					functionName: 'getPool',
					args: [pair.userToken, pair.validatorToken],
				})
				.catch(() => null)
			return {
				poolId: keccak256(
					encodeAbiParameters(
						[{ type: 'address' }, { type: 'address' }],
						[pair.userToken, pair.validatorToken],
					),
				),
				userToken: pair.userToken,
				validatorToken: pair.validatorToken,
				createdAt: parseTimestamp(pair.createdAt) ?? null,
				latestMintAt: parseTimestamp(pair.lastMintAt) ?? null,
				mintCount: Number(pair.mintCount),
				reserveUserToken: reserve?.reserveUserToken ?? null,
				reserveValidatorToken: reserve?.reserveValidatorToken ?? null,
				liquidityUsd:
					reserve && user.currency === 'USD' && validator.currency === 'USD'
						? Number(formatUnits(reserve.reserveUserToken, user.decimals)) +
							Number(
								formatUnits(reserve.reserveValidatorToken, validator.decimals),
							)
						: null,
				userTokenName: user.name,
				userTokenSymbol: user.symbol,
				userTokenDecimals: user.decimals,
				validatorTokenName: validator.name,
				validatorTokenSymbol: validator.symbol,
				validatorTokenDecimals: validator.decimals,
			}
		}),
	)
	return { pools, hasMore: rows.length > input.limit }
}

export const fetchFeeAmmPools = createServerFn({ method: 'POST' })
	.inputValidator((input) => feeAmmSearchSchema.parse(input))
	.handler(async ({ data }): Promise<FeeAmmPage> => {
		let timeout: ReturnType<typeof setTimeout> | undefined
		try {
			return await Promise.race([
				getFeeAmmPools(data),
				new Promise<never>((_, reject) => {
					timeout = setTimeout(
						() => reject(new Error('Fee AMM request timed out')),
						15_000,
					)
				}),
			])
		} catch (error) {
			console.error('Failed to fetch Fee AMM pools:', error)
			throw new Error(
				'Fee AMM liquidity is temporarily unavailable. Please try again.',
			)
		} finally {
			clearTimeout(timeout)
		}
	})
