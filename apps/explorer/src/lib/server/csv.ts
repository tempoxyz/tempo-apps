function escapeCsvCell(value: unknown): string {
	if (value === null || value === undefined) return ''

	const stringValue = String(value)
	if (!/[",\n\r]/.test(stringValue)) return stringValue

	return `"${stringValue.replaceAll('"', '""')}"`
}

export function buildCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
	return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
}

export function createTimestampedCsvFilename(
	prefix: string,
	identifier: string,
): string {
	const timestamp = new Date()
		.toISOString()
		.replaceAll(':', '-')
		.replaceAll('.', '-')

	return `${prefix}-${identifier.toLowerCase()}-${timestamp}.csv`
}

export function createCsvDownloadResponse(params: {
	csv: string
	filename: string
	headers?: HeadersInit | undefined
}): Response {
	return new Response(params.csv, {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Disposition': `attachment; filename="${params.filename}"`,
			'Content-Type': 'text/csv; charset=utf-8',
			...params.headers,
		},
	})
}
