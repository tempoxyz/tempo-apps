import type { Address } from 'ox'
import { formatUnits } from 'viem'
import type { Config } from 'wagmi'
import { Actions } from 'wagmi/tempo'

import type { BalancesResponse, TokenBalance } from '#lib/address-balances'
import {
	buildCsv,
	createCsvDownloadResponse,
	createTimestampedCsvFilename,
} from '#lib/server/csv'
import {
	fetchAddressTransferBalances,
	fetchTokenCreatedMetadata,
} from '#lib/server/tempo-queries'

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

export async function fetchAddressBalancesData(params: {
	address: Address.Address
	chainId: number
	config: Config
	maxTokens?: number | undefined
}): Promise<BalancesResponse> {
	const { address, chainId, config } = params
	const maxTokens = params.maxTokens ?? MAX_TOKENS

	const balancesResult = await fetchAddressTransferBalances(
		address,
		chainId,
	).catch((error) => {
		console.error(
			'[tidx] address balances query failed, returning empty balances:',
			error,
		)
		return []
	})

	const balances = new Map<string, bigint>()

	for (const row of balancesResult) {
		const token = String(row.token).toLowerCase()
		const received = BigInt(row.received ?? 0)
		const sent = BigInt(row.sent ?? 0)
		const balance = received - sent
		if (balance > 0n) {
			balances.set(token, balance)
		}
	}

	const nonZeroBalances = [...balances.entries()]
		.filter(([_, balance]) => balance > 0n)
		.map(([token, balance]) => ({
			token: token as Address.Address,
			balance,
		}))

	if (nonZeroBalances.length === 0) {
		return { balances: [] }
	}

	const topTokens = nonZeroBalances
		.sort((a, b) => {
			const aAbs = a.balance < 0n ? -a.balance : a.balance
			const bAbs = b.balance < 0n ? -b.balance : b.balance
			return bAbs > aAbs ? 1 : bAbs < aAbs ? -1 : 0
		})
		.slice(0, maxTokens)

	const topTokenAddresses = topTokens.map((token) => token.token)
	const tokenCreatedResult = await fetchTokenCreatedMetadata(
		chainId,
		topTokenAddresses,
	).catch(() => [])

	const tokenMetadata = new Map<
		string,
		{ name: string; symbol: string; currency: string }
	>()
	for (const row of tokenCreatedResult) {
		tokenMetadata.set(String(row.token).toLowerCase(), {
			name: String(row.name),
			symbol: String(row.symbol),
			currency: String(row.currency),
		})
	}

	const tokensMissingMetadata = topTokens
		.filter((token) => !tokenMetadata.has(token.token))
		.map((token) => token.token)

	if (tokensMissingMetadata.length > 0) {
		const rpcMetadataResults = await Promise.all(
			tokensMissingMetadata.map(async (token) => {
				try {
					const metadata = await Actions.token.getMetadata(config, {
						token,
					})
					return { token, metadata }
				} catch {
					return { token, metadata: null }
				}
			}),
		)

		for (const { token, metadata } of rpcMetadataResults) {
			if (metadata) {
				tokenMetadata.set(token.toLowerCase(), {
					name: metadata.name ?? '',
					symbol: metadata.symbol ?? '',
					currency: metadata.currency ?? '',
				})
			}
		}
	}

	const tokenBalances: TokenBalance[] = topTokens
		.map((row) => {
			const metadata = tokenMetadata.get(row.token)
			return {
				token: row.token,
				balance: row.balance.toString(),
				name: metadata?.name,
				symbol: metadata?.symbol,
				currency: metadata?.currency,
				decimals: TIP20_DECIMALS,
			}
		})
		.sort((a, b) => {
			const aIsUsd = a.currency === 'USD'
			const bIsUsd = b.currency === 'USD'

			if (aIsUsd && bIsUsd) {
				const aValue = Number(BigInt(a.balance)) / 10 ** TIP20_DECIMALS
				const bValue = Number(BigInt(b.balance)) / 10 ** TIP20_DECIMALS
				return bValue - aValue
			}

			if (aIsUsd) return -1
			if (bIsUsd) return 1

			return Number(BigInt(b.balance) - BigInt(a.balance))
		})

	return { balances: tokenBalances }
}
