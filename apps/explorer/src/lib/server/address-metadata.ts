import { type InferResponseType, parseResponse } from 'hono/client'
import type { Address } from 'ox'
import type { ContractCreationData } from '#lib/server/contract-creation'
import { api } from '#lib/server/tempo-api'
import type { ContractCreationReceiptRow } from '#lib/server/tempo-queries'
import { parseTimestamp } from '#lib/timestamp'

/**
 * Token header stats: exact `holderCount` and the `TokenCreated` timestamp.
 * Transfer boundaries stay on the SQL lane (`fetchTokenTransferBoundaries`) —
 * the API's `include=transferStats` aggregates are silently omitted upstream
 * for the largest tokens.
 */
export async function fetchTokenHeaderStats(
	chainId: number,
	token: Address.Address,
): Promise<
	InferResponseType<(typeof api.v1.tokens)[':token']['$get'], 200> | undefined
> {
	return parseResponse(
		api.v1.tokens[':token'].$get({
			param: { token },
			query: {
				chainId: String(chainId),
				include: 'createdAt,holderCount',
			},
		}),
	).catch((error) => {
		console.error(`Failed to fetch token header stats for ${token}:`, error)
		return undefined
	})
}

type AddressTxAggregate = {
	count?: number
	latestTxsBlockTimestamp?: unknown
	oldestTxsBlockTimestamp?: unknown
	oldestTxHash?: string
	oldestTxFrom?: string
}

export function pickTip20CreatedTimestamp(params: {
	tokenCreatedTimestamp: unknown
	firstTransferTimestamp: unknown
	contractCreationTimestamp?: unknown
}): number | undefined {
	const tokenCreatedTimestamp = parseTimestamp(params.tokenCreatedTimestamp)
	const firstTransferTimestamp = parseTimestamp(params.firstTransferTimestamp)
	const contractCreationTimestamp = parseTimestamp(
		params.contractCreationTimestamp,
	)

	if (tokenCreatedTimestamp != null) return tokenCreatedTimestamp

	return contractCreationTimestamp != null &&
		(firstTransferTimestamp == null ||
			contractCreationTimestamp < firstTransferTimestamp)
		? contractCreationTimestamp
		: firstTransferTimestamp
}

export function buildAddressTxMetadata(
	aggregate: AddressTxAggregate,
	creation: ContractCreationReceiptRow | ContractCreationData | undefined,
): {
	txCount: number
	lastActivityTimestamp?: number
	createdTimestamp?: number
	createdTxHash?: string
	createdBy?: string
} {
	const oldestTimestamp = parseTimestamp(aggregate.oldestTxsBlockTimestamp)
	const creationTimestamp = parseTimestamp(
		creation && 'block_timestamp' in creation
			? creation.block_timestamp
			: creation?.timestamp,
	)
	const useCreation =
		creationTimestamp != null &&
		(oldestTimestamp == null || creationTimestamp <= oldestTimestamp)

	return {
		txCount: (aggregate.count ?? 0) + (creation ? 1 : 0),
		lastActivityTimestamp: parseTimestamp(aggregate.latestTxsBlockTimestamp),
		createdTimestamp:
			useCreation && creationTimestamp != null
				? creationTimestamp
				: oldestTimestamp,
		createdTxHash:
			useCreation && creation
				? 'tx_hash' in creation
					? creation.tx_hash
					: (creation.hash ?? undefined)
				: aggregate.oldestTxHash,
		createdBy:
			useCreation && creation
				? (creation.from ?? undefined)
				: aggregate.oldestTxFrom,
	}
}
