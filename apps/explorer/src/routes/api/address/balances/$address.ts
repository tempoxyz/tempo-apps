import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import type { Address } from 'ox'
import type { Config } from 'wagmi'
import { getChainId } from 'wagmi/actions'
import { Actions } from 'wagmi/tempo'
import * as ABIS from '#lib/abis'
import { hasIndexSupply } from '#lib/env'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const TIP20_DECIMALS = 6

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 amount)'

export type TokenBalance = {
	token: Address.Address
	balance: string
	name?: string
	symbol?: string
	decimals?: number
	currency?: string
}

export type BalancesResponse = {
	balances: TokenBalance[]
	error?: string
}

export const Route = createFileRoute('/api/address/balances/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!hasIndexSupply())
					return Response.json({ balances: [] } satisfies BalancesResponse)

				try {
					const address = zAddress().parse(params.address)
					const config = getWagmiConfig()
					const chainId = getChainId(config)

					const qb = QB.withSignatures([TRANSFER_SIGNATURE])

					// Aggregate incoming transfers (to = address) by token
					const incomingQuery = qb
						.selectFrom('transfer')
						.select((eb) => [
							eb.ref('address').as('token'),
							eb.fn.sum('amount').as('received'),
						])
						.where('chain', '=', chainId)
						.where('to', '=', address)
						.groupBy('address')

					// Aggregate outgoing transfers (from = address) by token
					const outgoingQuery = qb
						.selectFrom('transfer')
						.select((eb) => [
							eb.ref('address').as('token'),
							eb.fn.sum('amount').as('sent'),
						])
						.where('chain', '=', chainId)
						.where('from', '=', address)
						.groupBy('address')

					// Query TokenCreated events (use andantino signature only for that chain)
					const tokenCreatedSignature =
						chainId === 42429
							? ABIS.TOKEN_CREATED_EVENT_ANDANTINO
							: ABIS.TOKEN_CREATED_EVENT

					const tokenCreatedQuery = QB.withSignatures([tokenCreatedSignature])
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

					// Merge incoming and outgoing to calculate balances
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

					if (nonZeroBalances.length === 0)
						return Response.json({ balances: [] } satisfies BalancesResponse)

					const MAX_TOKENS = 50

					// Fetch metadata via RPC for tokens missing from TokenCreated
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

					const tokenBalances: TokenBalance[] = nonZeroBalances
						.slice(0, MAX_TOKENS)
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

					return Response.json({
						balances: tokenBalances,
					} satisfies BalancesResponse)
				} catch (error) {
					console.error(error)
					const errorMessage = error instanceof Error ? error.message : error
					return Response.json(
						{
							balances: [],
							error: String(errorMessage),
						} satisfies BalancesResponse,
						{ status: 500 },
					)
				}
			},
		},
	},
})
