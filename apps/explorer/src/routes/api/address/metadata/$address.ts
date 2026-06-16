import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { VirtualAddress } from 'ox/tempo'
import { getCode } from 'viem/actions'
import { getAccountType, type AccountType } from '#lib/account'
import { isTip20Address } from '#lib/domain/tip20'
import { fetchContractCreationData } from '#lib/server/contract-creation'
import {
	fetchAddressOldestTx,
	fetchAddressTxStats,
	fetchContractCreationReceipt,
	fetchTokenTransferBoundaries,
	fetchVirtualAddressTransferStats,
} from '#lib/server/tempo-queries'
import {
	buildAddressTxMetadata,
	fetchTokenHeaderStats,
	pickTip20CreatedTimestamp,
} from '#lib/server/address-metadata'
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
				const fallback: AddressMetadataResponse = {
					address: params.address,
					chainId: 0,
					accountType: 'empty',
				}

				try {
					const address = zAddress({ lowercase: true }).parse(params.address)
					Address.assert(address)

					const client = getBatchedClient()
					const { id: chainId } = getTempoChain()
					const isTip20 = isTip20Address(address)
					const isVirtual = VirtualAddress.validate(address)

					const bytecodePromise = getCode(client, { address }).catch(
						() => undefined,
					)

					let response: AddressMetadataResponse

					if (isVirtual) {
						// One aggregate: exact distinct transfer-tx count + boundaries.
						const [bytecode, stats] = await Promise.all([
							bytecodePromise,
							fetchVirtualAddressTransferStats(address, chainId).catch(() => ({
								count: 0,
								oldestTimestamp: undefined,
								latestTimestamp: undefined,
							})),
						])
						response = {
							address,
							chainId,
							accountType: getAccountType(bytecode),
							txCount: stats.count,
							lastActivityTimestamp: parseTimestamp(stats.latestTimestamp),
							createdTimestamp: parseTimestamp(stats.oldestTimestamp),
						}
					} else if (isTip20) {
						// Exact holder count + TokenCreated timestamp from the API;
						// transfer boundaries in one raw-logs aggregate.
						const [bytecode, stats, boundaries] = await Promise.all([
							bytecodePromise,
							fetchTokenHeaderStats(chainId, address),
							fetchTokenTransferBoundaries(address, chainId).catch(() => ({
								oldestTimestamp: undefined,
								latestTimestamp: undefined,
							})),
						])
						const contractCreation =
							stats?.createdAt == null
								? await fetchContractCreationData(address).catch(() => null)
								: null

						response = {
							address,
							chainId,
							accountType: getAccountType(bytecode),
							holdersCount: stats?.holderCount ?? 0,
							lastActivityTimestamp: parseTimestamp(boundaries.latestTimestamp),
							createdTimestamp: pickTip20CreatedTimestamp({
								tokenCreatedTimestamp: stats?.createdAt,
								firstTransferTimestamp: boundaries.oldestTimestamp,
								contractCreationTimestamp: contractCreation?.timestamp,
							}),
						}
					} else {
						// One aggregate (exact distinct count + boundaries) + the oldest
						// tx row for the "created by" stat. Creation receipt stays on
						// the SQL lane (D4.1) with the existing RPC bisection fallback.
						const [bytecode, stats, oldestTx, indexedCreation] =
							await Promise.all([
								bytecodePromise,
								fetchAddressTxStats(address, chainId),
								fetchAddressOldestTx(address, chainId).catch(() => undefined),
								fetchContractCreationReceipt(address, chainId).catch(
									() => undefined,
								),
							])
						const accountType = getAccountType(bytecode)
						const creation =
							indexedCreation ??
							(accountType === 'contract'
								? await fetchContractCreationData(address).catch(() => null)
								: undefined) ??
							undefined
						const metadata = buildAddressTxMetadata(
							{
								count: stats.count,
								latestTxsBlockTimestamp: stats.latestTimestamp,
								oldestTxsBlockTimestamp: stats.oldestTimestamp,
								oldestTxHash: oldestTx?.hash,
								oldestTxFrom: oldestTx?.from,
							},
							creation,
						)

						response = {
							address,
							chainId,
							accountType,
							...metadata,
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
					return Response.json(
						{ ...fallback, error: String(errorMessage) },
						{ status: 500 },
					)
				}
			},
		},
	},
})
