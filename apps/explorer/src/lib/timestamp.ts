export function parseTimestamp(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value !== 'string') return undefined

	const parsedNumber = Number(value)
	if (Number.isFinite(parsedNumber)) return parsedNumber

	const parsedDate = Date.parse(value)
	if (Number.isFinite(parsedDate)) return Math.floor(parsedDate / 1000)

	const match = value.match(
		/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})/,
	)
	if (!match) return undefined

	const [, year, month, day, hour, minute, second] = match
	const date = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second)
	return Math.floor(date / 1000)
}
