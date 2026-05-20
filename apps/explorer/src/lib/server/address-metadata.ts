import type { ContractCreationReceiptRow } from '#lib/server/tempo-queries'
import { parseTimestamp } from '#lib/timestamp'

type AddressTxAggregate = {
	count?: number
	latestTxsBlockTimestamp?: unknown
	oldestTxsBlockTimestamp?: unknown
	oldestTxHash?: string
	oldestTxFrom?: string
}

type TokenCreatedTimestampRow = {
	block_timestamp: unknown
}

export function pickTokenCreatedTimestamp(
	createdRows: TokenCreatedTimestampRow[],
): number | undefined {
	return createdRows
		.map((row) => parseTimestamp(row.block_timestamp))
		.filter((value): value is number => value != null)
		.sort((left, right) => left - right)[0]
}

export function pickTip20CreatedTimestamp(params: {
	createdRows: TokenCreatedTimestampRow[]
	firstTransferTimestamp: unknown
	contractCreationTimestamp?: unknown
}): number | undefined {
	const tokenCreatedTimestamp = pickTokenCreatedTimestamp(params.createdRows)
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
	creation: ContractCreationReceiptRow | undefined,
): {
	txCount: number
	lastActivityTimestamp?: number
	createdTimestamp?: number
	createdTxHash?: string
	createdBy?: string
} {
	const oldestTimestamp = parseTimestamp(aggregate.oldestTxsBlockTimestamp)
	const creationTimestamp = parseTimestamp(creation?.block_timestamp)
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
			useCreation && creation ? creation.tx_hash : aggregate.oldestTxHash,
		createdBy: useCreation && creation ? creation.from : aggregate.oldestTxFrom,
	}
}
