import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { VirtualAddress } from 'ox/tempo'
import { getCode } from 'viem/actions'
import { getAccountType, type AccountType } from '#lib/account'
import { isTip20Address } from '#lib/domain/tip20'
import { fetchContractCreationData } from '#lib/server/contract-creation'
import {
	fetchAddressTxAggregate,
	fetchContractCreationReceipt,
	fetchTokenCreatedMetadata,
	fetchTokenHoldersCountRows,
	fetchTokenTransferAggregate,
	fetchVirtualAddressTransferAggregate,
} from '#lib/server/tempo-queries'
import {
	buildAddressTxMetadata,
	pickTip20CreatedTimestamp,
	pickTokenCreatedTimestamp,
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
					const address = zAddress().parse(params.address)
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
						const [bytecode, result] = await Promise.all([
							bytecodePromise,
							fetchVirtualAddressTransferAggregate(address, chainId).catch(
								() => ({
									count: 0,
									oldestTimestamp: undefined,
									latestTimestamp: undefined,
								}),
							),
						])
						response = {
							address,
							chainId,
							accountType: getAccountType(bytecode),
							txCount: result.count ?? 0,
							lastActivityTimestamp: parseTimestamp(result.latestTimestamp),
							createdTimestamp: parseTimestamp(result.oldestTimestamp),
						}
					} else if (isTip20) {
						const [bytecode, result, holdersRows, createdRows] =
							await Promise.all([
								bytecodePromise,
								fetchTokenTransferAggregate(address, chainId).catch(() => ({
									oldestTimestamp: undefined,
									latestTimestamp: undefined,
								})),
								fetchTokenHoldersCountRows([address], chainId, 10_000).catch(
									() => [],
								),
								fetchTokenCreatedMetadata(chainId, [address]).catch(() => []),
							])
						const tokenCreatedTimestamp = pickTokenCreatedTimestamp(createdRows)
						const contractCreation =
							tokenCreatedTimestamp == null
								? await fetchContractCreationData(address).catch(() => null)
								: null

						response = {
							address,
							chainId,
							accountType: getAccountType(bytecode),
							holdersCount: holdersRows[0]?.count ?? 0,
							lastActivityTimestamp: parseTimestamp(result.latestTimestamp),
							createdTimestamp: pickTip20CreatedTimestamp({
								createdRows,
								firstTransferTimestamp: result.oldestTimestamp,
								contractCreationTimestamp: contractCreation?.timestamp,
							}),
						}
					} else {
						const [bytecode, result, creation] = await Promise.all([
							bytecodePromise,
							fetchAddressTxAggregate(address, chainId),
							fetchContractCreationReceipt(address, chainId).catch(
								() => undefined,
							),
						])
						const metadata = buildAddressTxMetadata(result, creation)

						response = {
							address,
							chainId,
							accountType: getAccountType(bytecode),
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
