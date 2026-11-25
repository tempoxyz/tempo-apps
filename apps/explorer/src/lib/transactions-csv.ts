import type { EnrichedTransaction } from '#routes/api/address/history/$address.ts'

const columns = [
	'hash',
	'blockNumber',
	'timestamp',
	'from',
	'to',
	'value',
	'status',
	'gasUsed',
	'effectiveGasPrice',
] as const

function escapeCsvCell(value: string | number | null | undefined): string {
	const cell = value == null ? '' : String(value)
	return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell
}

/** Serialize enriched address transactions as a stable, spreadsheet-friendly CSV. */
export function serializeTransactionsCsv(
	transactions: readonly EnrichedTransaction[],
): string {
	const rows = [columns.join(',')]
	for (const transaction of transactions) {
		rows.push(
			[
				transaction.hash,
				transaction.blockNumber,
				transaction.timestamp,
				transaction.from,
				transaction.to,
				transaction.value,
				transaction.status,
				transaction.gasUsed,
				transaction.effectiveGasPrice,
			]
				.map(escapeCsvCell)
				.join(','),
		)
	}
	return rows.join('\n')
}

export function downloadTransactionsCsv(
	transactions: readonly EnrichedTransaction[],
	address: string,
): void {
	if (typeof window === 'undefined') return

	const blob = new Blob([serializeTransactionsCsv(transactions)], {
		type: 'text/csv;charset=utf-8',
	})
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = `${address}-transactions.csv`
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
	// Let the browser finish resolving the download URL before releasing it.
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
