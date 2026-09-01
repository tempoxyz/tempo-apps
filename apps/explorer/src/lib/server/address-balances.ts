import { createServerFn } from '@tanstack/react-start'
import { type InferResponseType, parseResponse } from 'hono/client'
import type { Address } from 'ox'
import { formatUnits } from 'viem'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'

import type { BalancesResponse, TokenBalance } from '#lib/address-balances'
import { serverEnv, tempoApiUrl } from '#lib/server/env'
import { api } from '#lib/server/tempo-api'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config.ts'

export const TIP20_DECIMALS = 6
export const MAX_TOKENS = 50

type BalancesApiResponse = InferResponseType<
	(typeof api.v1.addresses)[':address']['balances']['$get'],
	200
>

const EarnPositionsResponse = z.object({
	data: z.array(
		z.object({
			assetAmount: z.object({
				amount: z.string(),
				currency: z.string(),
				decimals: z.number(),
			}),
			shareToken: z.object({ address: z.string() }),
		}),
	),
})

type EarnPosition = z.infer<typeof EarnPositionsResponse>['data'][number]

/**
 * Maps API balance rows (token metadata included) into the page's shape,
 * sorted USD-denominated tokens first by value, then others by raw balance.
 */
export function mapBalances(data: BalancesApiResponse['data']): TokenBalance[] {
	return sortBalances(
		data.map(
			(item): TokenBalance => ({
				token: item.token.address,
				balance: item.amount,
				name: item.token.name,
				symbol: item.token.symbol,
				currency: item.token.currency,
				decimals: item.token.decimals,
			}),
		),
	)
}

function usdValue(balance: TokenBalance): number | undefined {
	const value = balance.valuation ?? {
		amount: balance.balance,
		currency: balance.currency,
		decimals: balance.decimals ?? TIP20_DECIMALS,
	}
	if (value.currency !== 'USD') return undefined
	return Number(formatUnits(BigInt(value.amount), value.decimals))
}

function sortBalances(balances: TokenBalance[]): TokenBalance[] {
	return balances.sort((a, b) => {
		const aValue = usdValue(a)
		const bValue = usdValue(b)
		if (aValue !== undefined && bValue !== undefined) return bValue - aValue
		if (aValue !== undefined) return -1
		if (bValue !== undefined) return 1
		return Number(BigInt(b.balance) - BigInt(a.balance))
	})
}

/** Applies API-computed underlying asset values to matching Earn share tokens. */
export function applyEarnPositionValues(
	balances: TokenBalance[],
	positions: EarnPosition[],
): TokenBalance[] {
	const values = new Map(
		positions.map((position) => [
			position.shareToken.address.toLowerCase(),
			position.assetAmount,
		]),
	)
	return sortBalances(
		balances.map((balance) => ({
			...balance,
			valuation: values.get(balance.token.toLowerCase()),
		})),
	)
}

async function fetchEarnPositions(params: {
	address: Address.Address
	chainId: number
	limit: number
}): Promise<EarnPosition[]> {
	try {
		const url = new URL(
			`/v1/earn/addresses/${params.address}/positions`,
			tempoApiUrl,
		)
		url.searchParams.set('chainId', String(params.chainId))
		url.searchParams.set('limit', String(params.limit))
		url.searchParams.set('verified', 'true')
		const response = await fetch(url, {
			headers: serverEnv.TEMPO_API_KEY
				? { 'tempo-api-key': serverEnv.TEMPO_API_KEY }
				: undefined,
			signal: AbortSignal.timeout(4_000),
		})
		if (!response.ok) throw new Error(`Tempo API returned ${response.status}`)
		return EarnPositionsResponse.parse(await response.json()).data
	} catch (error) {
		console.error('Failed to fetch Earn position values:', error)
		return []
	}
}

export async function fetchAddressBalancesData(params: {
	address: Address.Address
	chainId: number
	maxTokens?: number | undefined
}): Promise<BalancesResponse> {
	const { address, chainId } = params
	const maxTokens = params.maxTokens ?? MAX_TOKENS

	const [{ data }, earnPositions] = await Promise.all([
		parseResponse(
			api.v1.addresses[':address'].balances.$get({
				param: { address },
				query: { chainId: String(chainId), limit: String(maxTokens) },
			}),
		),
		fetchEarnPositions({ address, chainId, limit: maxTokens }),
	])

	return { balances: applyEarnPositionValues(mapBalances(data), earnPositions) }
}

export const fetchAddressBalances = createServerFn({ method: 'GET' })
	.inputValidator((input) => zAddress().parse(input))
	.handler(({ data }) =>
		fetchAddressBalancesData({
			address: data,
			chainId: getChainId(getWagmiConfig()),
		}),
	)
