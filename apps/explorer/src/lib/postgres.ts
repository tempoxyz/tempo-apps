export function parsePgTimestamp(timestamptz: string): number {
	const [pgDate, pgTime] = timestamptz.split(' ', 2)
	if (!pgTime) throw new Error('Invalid timestamp format (missing time)')
	const [time] = pgTime.split('.')
	if (!time) throw new Error('Invalid timestamp format (invalid time)')
	const [h, m, s] = time.split(':')
	const parsed = Date.parse(`${pgDate}T${h.padStart(2, '0')}:${m}:${s}Z`)
	if (Number.isNaN(parsed))
		throw new Error('Invalid timestamp format (could not parse)')
	return Math.floor(parsed / 1000)
}
