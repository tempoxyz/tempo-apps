import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { getCode } from 'viem/actions'
import { getChainId } from 'wagmi/actions'
import { getAccountType, type AccountType } from '#lib/account'
import { isTip20Address } from '#lib/domain/tip20'
import { hasIndexSupply } from '#lib/env'
import {
	fetchAddressTxAggregate,
	fetchTokenTransferAggregate,
} from '#lib/server/tempo-queries'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

function parseTimestamp(value: unknown): number | undefined {
	if (typeof value === 'number') return value
	if (typeof value !== 'string') return undefined

	const parsed = Date.parse(value)
	if (Number.isFinite(parsed)) return Math.floor(parsed / 1000)

	// Legacy idxs format: "2026-01-15 7:13:33.0 +00:00:00"
	// (single-digit hours don't conform to ISO 8601)
	const match = value.match(
		/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})/,
	)
	if (!match) return undefined
	const [, year, month, day, hour, min, sec] = match
	const date = Date.UTC(+year, +month - 1, +day, +hour, +min, +sec)
	return Math.floor(date / 1000)
}

export type AddressMetadataResponse = {
	address: string
	chainId: number
	accountType: AccountType
	txCount?: number
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

				if (!hasIndexSupply()) return Response.json(fallback)

				try {
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const config = getWagmiConfig()
					const client = config.getClient()
					const chainId = getChainId(config)

					const isTip20 = isTip20Address(address)

					const bytecodePromise = getCode(client, { address }).catch(
						() => undefined,
					)

					let response: AddressMetadataResponse

					if (isTip20) {
						const [bytecode, result] = await Promise.all([
							bytecodePromise,
							fetchTokenTransferAggregate(address, chainId).catch(() => ({
								oldestTimestamp: undefined,
								latestTimestamp: undefined,
							})),
						])
						response = {
							address,
							chainId,
							accountType: getAccountType(bytecode),
							lastActivityTimestamp: parseTimestamp(result.latestTimestamp),
							createdTimestamp: parseTimestamp(result.oldestTimestamp),
						}
					} else {
						const [bytecode, result] = await Promise.all([
							bytecodePromise,
							fetchAddressTxAggregate(address, chainId),
						])
						response = {
							address,
							chainId,
							accountType: getAccountType(bytecode),
							txCount: result.count ?? 0,
							lastActivityTimestamp: parseTimestamp(
								result.latestTxsBlockTimestamp,
							),
							createdTimestamp: parseTimestamp(result.oldestTxsBlockTimestamp),
							createdTxHash: result.oldestTxHash,
							createdBy: result.oldestTxFrom,
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
