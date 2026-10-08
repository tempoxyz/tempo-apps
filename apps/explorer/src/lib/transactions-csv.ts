import type { EnrichedTransaction } from '#routes/api/address/history/$address.ts'

const columns = [
	'timestamp',
	'hash',
	'blockNumber',
	'transactionIndex',
	'from',
	'to',
	'value',
	'status',
	'gasUsed',
	'effectiveGasPrice',
	'knownEvents',
] as const

function escapeCsvField(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** Serialize enriched address history transactions as RFC 4180-style CSV. */
export function serializeTransactionsCsv(
	transactions: readonly EnrichedTransaction[],
): string {
	const rows = transactions.map((transaction) => [
		new Date(transaction.timestamp * 1000).toISOString(),
		transaction.hash,
		transaction.blockNumber,
		transaction.transactionIndex?.toString() ?? '',
		transaction.from,
		transaction.to ?? '',
		transaction.value,
		transaction.status,
		transaction.gasUsed,
		transaction.effectiveGasPrice,
		JSON.stringify(transaction.knownEvents),
	])

	return [columns, ...rows]
		.map((row) => row.map((value) => escapeCsvField(String(value))).join(','))
		.join('\r\n')
}
