import type { Hex } from 'viem'

// shorten a hex to look like 0x1234…5678
export function shortenHex(hex: Hex, chars: number = 4) {
	return hex.length < chars * 2 + 2
		? hex
		: `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('en-US', {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
})

const timezoneFormatter = new Intl.DateTimeFormat('en-US', {
	timeZoneName: 'shortOffset',
})

export function formatTimestampDate(timestamp: bigint): string {
	return dateFormatter.format(new Date(Number(timestamp) * 1000))
}

export function formatTimestampTime(timestamp: bigint): {
	time: string
	timezone: string
	offset: string
} {
	const date = new Date(Number(timestamp) * 1000)

	const parts = timezoneFormatter.formatToParts(date)
	const timeZonePart =
		parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0'

	const signIndex = Math.max(
		timeZonePart.indexOf('+'),
		timeZonePart.indexOf('-'),
	)
	const timezone = signIndex > 0 ? timeZonePart.slice(0, signIndex) : 'GMT'
	const offset = signIndex > 0 ? timeZonePart.slice(signIndex) : '+0'

	return { time: timeFormatter.format(date), timezone, offset }
}
