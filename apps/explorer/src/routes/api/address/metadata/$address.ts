import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { getCode } from 'viem/actions'
import { getChainId } from 'wagmi/actions'
import { getAccountType, type AccountType } from '#lib/account'
import { hasIndexSupply } from '#lib/env'
import { fetchAddressTxAggregate } from '#lib/server/tempo-queries'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

function parseTimestamp(value: unknown): number | undefined {
	if (typeof value === 'number') return value
	if (typeof value !== 'string') return undefined
	// Format: "2026-01-15 7:13:33.0 +00:00:00" - parse components directly
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

					// Single aggregate query: COUNT + MIN/MAX timestamps
					// MIN/MAX are "free" since COUNT already scans all rows
					const [bytecode, txAggResult] = await Promise.all([
						// Account type detection (single RPC call)
						getCode(client, { address }).catch(() => undefined),

						// Combined query: count + newest + oldest in one scan
						fetchAddressTxAggregate(address, chainId),
					])

					const accountType = getAccountType(bytecode)
					const txCount = txAggResult?.count ?? 0
					const lastActivityTimestamp = parseTimestamp(
						txAggResult?.latestTxsBlockTimestamp,
					)
					const createdTimestamp = parseTimestamp(
						txAggResult?.oldestTxsBlockTimestamp,
					)

					const response: AddressMetadataResponse = {
						address,
						chainId,
						accountType,
						txCount,
						lastActivityTimestamp,
						createdTimestamp,
						createdTxHash: txAggResult?.oldestTxHash,
						createdBy: txAggResult?.oldestTxFrom,
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
