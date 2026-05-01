import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { VirtualAddress } from 'ox/tempo'
import { getCode } from 'viem/actions'
import { getAccountType, type AccountType } from '#lib/account'
import { isTip20Address } from '#lib/domain/tip20'
import { hasIndexSupply } from '#lib/env'
import {
	fetchAddressTxAggregate,
	fetchTokenHoldersCountRows,
	fetchTokenTransferAggregate,
	fetchVirtualAddressTransferAggregate,
} from '#lib/server/tempo-queries'
import { parseTimestamp } from '#lib/timestamp'
import { zAddress } from '#lib/zod'
import { getBatchedClient, getTempoChain } from '#wagmi.config.ts'

export type AddressMetadataResponse = {
	address: string
	chainId: number
	accountType: AccountType
	txCount?: number
	holdersCount?: number
	lastActivityTimestamp?: number
	createdTimestamp?: number
	createdTxHash?: string
	createdBy?: string
	error?: string
}

export const Route = createFileRoute('/api/address/metadata/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const { id: chainId } = getTempoChain()

				try {
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const client = getBatchedClient()
					const isTip20 = isTip20Address(address)
					const isVirtual = VirtualAddress.validate(address)
					const bytecode = await getCode(client, { address }).catch(
						() => undefined,
					)
					const baseResponse: AddressMetadataResponse = {
						address,
						chainId,
						accountType: getAccountType(bytecode),
					}

					if (!hasIndexSupply()) return Response.json(baseResponse)

					let response: AddressMetadataResponse

					if (isVirtual) {
						const result = await fetchVirtualAddressTransferAggregate(
							address,
							chainId,
						).catch(() => ({
							count: 0,
							oldestTimestamp: undefined,
							latestTimestamp: undefined,
						}))
						response = {
							...baseResponse,
							txCount: result.count ?? 0,
							lastActivityTimestamp: parseTimestamp(result.latestTimestamp),
							createdTimestamp: parseTimestamp(result.oldestTimestamp),
						}
					} else if (isTip20) {
						const [result, holdersRows] = await Promise.all([
							fetchTokenTransferAggregate(address, chainId).catch(() => ({
								oldestTimestamp: undefined,
								latestTimestamp: undefined,
							})),
							fetchTokenHoldersCountRows([address], chainId, 10_000).catch(
								() => [],
							),
						])
						response = {
							...baseResponse,
							holdersCount: holdersRows[0]?.count ?? 0,
							lastActivityTimestamp: parseTimestamp(result.latestTimestamp),
							createdTimestamp: parseTimestamp(result.oldestTimestamp),
						}
					} else {
						const aggregate = await Promise.allSettled([
							fetchAddressTxAggregate(address, chainId),
						])
						const result = aggregate[0]
						if (result.status === 'rejected') console.error(result.reason)
						response = {
							...baseResponse,
							txCount:
								result.status === 'fulfilled' ? result.value.count : undefined,
							lastActivityTimestamp: parseTimestamp(
								result.status === 'fulfilled'
									? result.value.latestTxsBlockTimestamp
									: undefined,
							),
							createdTimestamp: parseTimestamp(
								result.status === 'fulfilled'
									? result.value.oldestTxsBlockTimestamp
									: undefined,
							),
							createdTxHash:
								result.status === 'fulfilled'
									? result.value.oldestTxHash
									: undefined,
							createdBy:
								result.status === 'fulfilled'
									? result.value.oldestTxFrom
									: undefined,
						}
					}

					return Response.json(response, {
						headers: {
							'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
						},
					})
				} catch (error) {
					console.error(error)
					const errorMessage = error instanceof Error ? error.message : error
					const fallback: AddressMetadataResponse = {
						address: params.address,
						chainId,
						accountType: 'empty',
					}
					return Response.json(
						{ ...fallback, error: String(errorMessage) },
						{ status: 500 },
					)
				}
			},
		},
	},
})
