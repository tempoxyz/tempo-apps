import type { EnrichedTransaction } from '#routes/api/address/history/$address.ts'

const columns = [
	'timestamp',
	'hash',
	'block_number',
	'transaction_index',
	'from',
	'to',
	'value',
	'status',
	'gas_used',
	'effective_gas_price',
	'fee',
] as const

function escapeCsv(value: unknown): string {
	if (value === null || value === undefined) return ''
	const text = String(value)
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function getFee(transaction: EnrichedTransaction): string {
	try {
		return (
			BigInt(transaction.gasUsed) * BigInt(transaction.effectiveGasPrice)
		).toString()
	} catch {
		return ''
	}
}

/** Convert transaction history rows into a CSV document. */
export function serializeTransactionsCsv(
	transactions: readonly EnrichedTransaction[],
): string {
	const rows = transactions.map((transaction) => {
		let timestamp = ''
		if (Number.isFinite(transaction.timestamp)) {
			const date = new Date(transaction.timestamp * 1000)
			if (!Number.isNaN(date.getTime())) timestamp = date.toISOString()
		}
		return [
			timestamp,
			transaction.hash,
			transaction.blockNumber,
			transaction.transactionIndex,
			transaction.from,
			transaction.to,
			transaction.value,
			transaction.status,
			transaction.gasUsed,
			transaction.effectiveGasPrice,
			getFee(transaction),
		].map(escapeCsv)
	})

	return [
		columns.map(escapeCsv).join(','),
		...rows.map((row) => row.join(',')),
	].join('\r\n')
}

/** Download transaction rows as a CSV file in the browser. */
export function downloadTransactionsCsv(
	transactions: readonly EnrichedTransaction[],
	filename: string,
): void {
	if (
		typeof document === 'undefined' ||
		typeof URL.createObjectURL !== 'function'
	)
		return

	const blob = new Blob([serializeTransactionsCsv(transactions)], {
		type: 'text/csv;charset=utf-8',
	})
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	anchor.style.display = 'none'
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
