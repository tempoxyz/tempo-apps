import type { Token } from '#lib/server/tokens'

const headers = [
	'Symbol',
	'Name',
	'Currency',
	'Holders',
	'Address',
	'Created (Unix seconds)',
]
const formulaPrefix = /^\s*[=+\-@\t\r\n]/u

function escapeTokenText(value: string): string {
	return formulaPrefix.test(value) ? `'${value}` : value
}

function escapeCsvField(value: string): string {
	return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** Serialize just the provided token rows as an RFC 4180 CSV document. */
export function serializeTokenCsv(tokens: readonly Token[]): string {
	const rows = tokens.map((token) => [
		escapeTokenText(token.symbol),
		escapeTokenText(token.name),
		escapeTokenText(token.currency),
		token.holdersCount == null ? '' : String(token.holdersCount),
		escapeTokenText(token.address),
		token.createdAt == null ? '' : String(token.createdAt),
	])

	return [headers, ...rows]
		.map((row) => row.map(escapeCsvField).join(','))
		.join('\r\n')
}
