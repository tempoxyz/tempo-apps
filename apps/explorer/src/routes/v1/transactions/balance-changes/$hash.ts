import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'ox'
import { getAbiItem, parseEventLogs, zeroAddress } from 'viem'
import { getTransactionReceipt, readContract } from 'viem/actions'
import { Abis } from 'viem/tempo'
import * as z from 'zod/mini'
import type { BalanceChange } from '../../_types'
import {
	badRequest,
	corsPreflightResponse,
	DEFAULT_LIMIT,
	MAX_LIMIT,
	notFound,
	paginatedResponse,
	serverError,
} from '../../_utils'
import { mapWithConcurrency } from '#lib/network.ts'
import { zHash } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config.ts'

const transferAbi = [getAbiItem({ abi: Abis.tip20, name: 'Transfer' })]

const QuerySchema = z.object({
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
	offset: z.prefault(z.coerce.number(), 0),
})

export const Route = createFileRoute('/v1/transactions/balance-changes/$hash')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async ({ params, request }) => {
				try {
					const parseResult = zHash().safeParse(params.hash)
					if (!parseResult.success) {
						return badRequest('Invalid transaction hash format')
					}
					const hash = parseResult.data

					const url = new URL(request.url)
					const queryResult = QuerySchema.safeParse(
						Object.fromEntries(url.searchParams),
					)
					if (!queryResult.success) {
						return badRequest('Invalid query parameters', queryResult.error)
					}

					const query = queryResult.data
					const limit = Math.min(Math.max(query.limit, 1), MAX_LIMIT)
					const offset = Math.max(query.offset, 0)

					const client = getWagmiConfig().getClient()

					let receipt
					try {
						receipt = await getTransactionReceipt(client, { hash })
					} catch {
						return notFound('Transaction not found')
					}

					const events = parseEventLogs({
						abi: transferAbi,
						logs: receipt.logs,
						strict: false,
					})

					const changes = new Map<
						string,
						{
							address: Address.Address
							token: Address.Address
							diff: bigint
						}
					>()

					const addChange = (
						address: Address.Address,
						token: Address.Address,
						amount: bigint,
					) => {
						if (address === zeroAddress) return
						const key = `${address}:${token}`
						const change = changes.get(key)
						if (change) change.diff += amount
						else changes.set(key, { address, token, diff: amount })
					}

					for (const event of events) {
						if (event.eventName !== 'Transfer') continue
						const { from, to, amount } = event.args
						if (!amount) continue
						if (from) addChange(from, event.address, -amount)
						if (to) addChange(to, event.address, amount)
					}

					const balanceChanges = Array.from(changes.values()).filter(
						({ diff }) => diff !== 0n,
					)

					if (balanceChanges.length === 0) {
						return paginatedResponse<BalanceChange[]>([], {
							total: 0,
							offset: 0,
							limit,
							hasMore: false,
						})
					}

					const uniqueTokens = [
						...new Set(balanceChanges.map(({ token }) => token)),
					]

					const getTokenMetadata = async (token: Address.Address) => {
						const [decimals, symbol] = await Promise.all([
							readContract(client, {
								address: token,
								abi: Abis.tip20,
								functionName: 'decimals',
							}).catch(() => 18),
							readContract(client, {
								address: token,
								abi: Abis.tip20,
								functionName: 'symbol',
							}).catch(() => 'UNKNOWN'),
						])
						return { decimals, symbol }
					}

					const tokenMetadataEntries = await mapWithConcurrency(
						uniqueTokens,
						async (token) =>
							[token, await getTokenMetadata(token)] as const,
					)
					const tokenMetadata = Object.fromEntries(tokenMetadataEntries)

					const balanceAfterResults = await mapWithConcurrency(
						balanceChanges,
						async (change) => ({
							...change,
							balanceAfter: await readContract(client, {
								address: change.token,
								abi: Abis.tip20,
								functionName: 'balanceOf',
								args: [change.address],
								blockNumber: receipt.blockNumber,
							}).catch(() => null),
						}),
					)

					const allChanges: BalanceChange[] = balanceAfterResults
						.filter(
							(change): change is typeof change & { balanceAfter: bigint } =>
								change.balanceAfter !== null,
						)
						.map((change) => {
							const meta = tokenMetadata[change.token]
							return {
								address: change.address,
								token: change.token,
								symbol: meta?.symbol ?? 'UNKNOWN',
								decimals: meta?.decimals ?? 18,
								balanceBefore: String(change.balanceAfter - change.diff),
								balanceAfter: String(change.balanceAfter),
								diff: String(change.diff),
							}
						})

					const paginatedChanges = allChanges.slice(offset, offset + limit)
					const hasMore = offset + limit < allChanges.length

					return paginatedResponse(paginatedChanges, {
						total: allChanges.length,
						offset: offset + paginatedChanges.length,
						limit,
						hasMore,
					})
				} catch (error) {
					console.error('Balance changes error:', error)
					return serverError('Failed to fetch balance changes')
				}
			},
		},
	},
})
