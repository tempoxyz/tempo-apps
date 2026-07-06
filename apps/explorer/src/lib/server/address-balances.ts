import { createServerFn } from '@tanstack/react-start'
import { type InferResponseType, parseResponse } from 'hono/client'
import type { Address } from 'ox'
import { formatUnits } from 'viem'
import { getChainId } from 'wagmi/actions'

import type { BalancesResponse, TokenBalance } from '#lib/address-balances'
import {
	buildCsv,
	createCsvDownloadResponse,
	createTimestampedCsvFilename,
} from '#lib/server/csv'
import { api } from '#lib/server/tempo-api'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config.ts'

export const TIP20_DECIMALS = 6
export const MAX_TOKENS = 50

export function createBalancesCsvResponse(params: {
	address: Address.Address
	balances: ReadonlyArray<TokenBalance>
}): Response {
	const rows: Array<ReadonlyArray<unknown>> = [
		[
			'token_address',
			'symbol',
			'name',
			'currency',
			'decimals',
			'balance_raw',
			'balance_formatted',
		],
	]

	for (const balance of params.balances) {
		const decimals = balance.decimals ?? TIP20_DECIMALS
		const rawBalance = BigInt(balance.balance)
		rows.push([
			balance.token,
			balance.symbol,
			balance.name,
			balance.currency,
			decimals,
			rawBalance.toString(),
			formatUnits(rawBalance, decimals),
		])
	}

	return createCsvDownloadResponse({
		csv: buildCsv(rows),
		filename: createTimestampedCsvFilename('balances', params.address),
		headers: {
			'X-Tempo-Export-Row-Limit': String(MAX_TOKENS),
		},
	})
}

type BalancesApiResponse = InferResponseType<
	(typeof api.v1.addresses)[':address']['balances']['$get'],
	200
>

/**
 * Maps API balance rows (token metadata included) into the page's shape,
 * sorted USD-denominated tokens first by value, then others by raw balance.
 */
export function mapBalances(data: BalancesApiResponse['data']): TokenBalance[] {
	return data
		.map(
			(item): TokenBalance => ({
				token: item.token.address,
				balance: item.amount,
				name: item.token.name,
				symbol: item.token.symbol,
				currency: item.token.currency,
				decimals: item.token.decimals,
			}),
		)
		.sort((a, b) => {
			const aIsUsd = a.currency === 'USD'
			const bIsUsd = b.currency === 'USD'

			if (aIsUsd && bIsUsd) {
				const aValue = Number(
					formatUnits(BigInt(a.balance), a.decimals ?? TIP20_DECIMALS),
				)
				const bValue = Number(
					formatUnits(BigInt(b.balance), b.decimals ?? TIP20_DECIMALS),
				)
				return bValue - aValue
			}

			if (aIsUsd) return -1
			if (bIsUsd) return 1

			return Number(BigInt(b.balance) - BigInt(a.balance))
		})
}

export async function fetchAddressBalancesData(params: {
	address: Address.Address
	chainId: number
	maxTokens?: number | undefined
}): Promise<BalancesResponse> {
	const { address, chainId } = params
	const maxTokens = params.maxTokens ?? MAX_TOKENS

	const { data } = await parseResponse(
		api.v1.addresses[':address'].balances.$get({
			param: { address },
			query: { chainId: String(chainId), limit: String(maxTokens) },
		}),
	)

	return { balances: mapBalances(data) }
}

export const fetchAddressBalances = createServerFn({ method: 'GET' })
	.inputValidator((input) => zAddress().parse(input))
	.handler(({ data }) =>
		fetchAddressBalancesData({
			address: data,
			chainId: getChainId(getWagmiConfig()),
		}),
	)
