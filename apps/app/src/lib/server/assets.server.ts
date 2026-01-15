import { createServerFn } from '@tanstack/react-start'
import * as IDX from 'idxs'
import type { Address } from 'ox'
import type { Config } from 'wagmi'
import { getChainId } from 'wagmi/actions'
import { Actions } from 'wagmi/tempo'
import { TOKEN_CREATED_EVENT } from '#lib/abis'
import { getWagmiConfig } from '#wagmi.config'

const TIP20_DECIMALS = 6

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 amount)'

export type AssetData = {
	address: Address.Address
	metadata:
		| { name?: string; symbol?: string; decimals?: number; priceUsd?: number }
		| undefined
	balance: string | undefined
	valueUsd: number | undefined
}

export const fetchAssets = createServerFn({ method: 'GET' })
	.inputValidator((input: { address: string }) => input)
	.handler(async ({ data }): Promise<AssetData[] | null> => {
		try {
			const address = data.address as Address.Address
			const config = getWagmiConfig()
			const chainId = getChainId(config)

			const qb = QB.withSignatures([TRANSFER_SIGNATURE])

			const incomingQuery = qb
				.selectFrom('transfer')
				.select((eb) => [
					eb.ref('address').as('token'),
					eb.fn.sum('amount').as('received'),
				])
				.where('chain', '=', chainId)
				.where('to', '=', address)
				.groupBy('address')

			const outgoingQuery = qb
				.selectFrom('transfer')
				.select((eb) => [
					eb.ref('address').as('token'),
					eb.fn.sum('amount').as('sent'),
				])
				.where('chain', '=', chainId)
				.where('from', '=', address)
				.groupBy('address')

			const tokenCreatedQuery = QB.withSignatures([TOKEN_CREATED_EVENT])
				.selectFrom('tokencreated')
				.select(['token', 'name', 'symbol', 'currency'])
				.where('chain', '=', chainId as never)

			const [incomingResult, outgoingResult, tokenCreatedResult] =
				await Promise.all([
					incomingQuery.execute(),
					outgoingQuery.execute(),
					tokenCreatedQuery.execute(),
				])

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

			const balances = new Map<string, bigint>()

			for (const row of incomingResult) {
				const token = String(row.token).toLowerCase()
				const received = BigInt(row.received)
				balances.set(token, (balances.get(token) ?? 0n) + received)
			}

			for (const row of outgoingResult) {
				const token = String(row.token).toLowerCase()
				const sent = BigInt(row.sent)
				balances.set(token, (balances.get(token) ?? 0n) - sent)
			}

			const nonZeroBalances = [...balances.entries()]
				.filter(([_, balance]) => balance !== 0n)
				.map(([token, balance]) => ({
					token: token as Address.Address,
					balance,
					metadata: tokenMetadata.get(token),
				}))

			if (nonZeroBalances.length === 0) return []

			const MAX_TOKENS = 50

			const tokensMissingMetadata = nonZeroBalances
				.slice(0, MAX_TOKENS)
				.filter((t) => !t.metadata)
				.map((t) => t.token)

			if (tokensMissingMetadata.length > 0) {
				const rpcMetadataResults = await Promise.all(
					tokensMissingMetadata.map(async (token) => {
						try {
							const metadata = await Actions.token.getMetadata(
								config as Config,
								{ token },
							)
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
							currency: '',
						})
					}
				}
			}

			const assets: AssetData[] = nonZeroBalances
				.slice(0, MAX_TOKENS)
				.map((row) => {
					const metadata = tokenMetadata.get(row.token)
					const isUsd = metadata?.currency === 'USD'
					const valueUsd = isUsd
						? Number(row.balance) / 10 ** TIP20_DECIMALS
						: undefined

					return {
						address: row.token,
						metadata: metadata
							? {
									name: metadata.name,
									symbol: metadata.symbol,
									decimals: TIP20_DECIMALS,
								}
							: undefined,
						balance: row.balance.toString(),
						valueUsd,
					}
				})
				.sort((a, b) => {
					const aIsUsd = a.valueUsd !== undefined
					const bIsUsd = b.valueUsd !== undefined

					if (aIsUsd && bIsUsd) {
						return (b.valueUsd ?? 0) - (a.valueUsd ?? 0)
					}

					if (aIsUsd) return -1
					if (bIsUsd) return 1

					return Number(BigInt(b.balance ?? '0') - BigInt(a.balance ?? '0'))
				})

			return assets
		} catch (error) {
			console.error('fetchAssets error:', error)
			return null
		}
	})
