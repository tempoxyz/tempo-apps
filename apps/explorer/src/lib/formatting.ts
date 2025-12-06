import { type Hex, Value } from 'ox'

export namespace HexFormatter {
	export function truncate(value: Hex.Hex, chars = 4) {
		return value.length < chars * 2 + 2
			? value
			: `${value.slice(0, chars + 2)}…${value.slice(-chars)}`
	}

	// shorten a hex to look like 0x1234…5678
	export function shortenHex(hex: Hex.Hex, chars: number = 4) {
		return hex.length < chars * 2 + 2
			? hex
			: `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`
	}
}

export namespace DateFormatter {
	/**
	 * Formats a timestamp to a localized date-time string.
	 *
	 * @param timestamp - The timestamp in seconds.
	 * @returns The formatted date-time string.
	 */
	export function format(timestamp: bigint) {
		return new Date(Number(timestamp) * 1000).toLocaleString(undefined, {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
		})
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

	/**
	 * Formats a timestamp to a UTC date-time string.
	 *
	 * @param timestamp - The timestamp in seconds.
	 * @returns The formatted UTC date-time string.
	 */
	const utcFormatter = new Intl.DateTimeFormat('en-US', {
		year: '2-digit',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
		timeZone: 'UTC',
	})

	export function formatUtcTimestamp(timestamp: bigint) {
		return utcFormatter.format(new Date(Number(timestamp) * 1_000))
	}

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

	const relativeTimeFormatter = new Intl.RelativeTimeFormat('en-US', {
		numeric: 'auto',
		style: 'narrow',
	})

	export function formatRelativeTime(timestamp: bigint): {
		text: string
		fullDate: string
	} {
		const date = new Date(Number(timestamp) * 1_000)
		const now = new Date()
		const diffMs = now.getTime() - date.getTime()
		const diffSec = Math.floor(diffMs / 1000)
		const diffMin = Math.floor(diffSec / 60)
		const diffHour = Math.floor(diffMin / 60)
		const diffDay = Math.floor(diffHour / 24)

		const fullDate = date.toLocaleString()
		const rtf = relativeTimeFormatter
		if (diffSec < 60) return { fullDate, text: rtf.format(-diffSec, 'second') }
		if (diffMin < 60) return { fullDate, text: rtf.format(-diffMin, 'minute') }
		if (diffHour < 24) return { fullDate, text: rtf.format(-diffHour, 'hour') }
		return { text: rtf.format(-diffDay, 'day'), fullDate }
	}

	export function formatDuration(seconds: number): string {
		const days = Math.floor(seconds / 86400)
		const hrs = Math.floor((seconds % 86400) / 3600)
		const mins = Math.floor((seconds % 3600) / 60)
		const secs = seconds % 60

		const parts = []
		if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`)
		if (hrs > 0) parts.push(`${hrs}h`)
		if (mins > 0) parts.push(`${mins}m`)
		if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

		return parts.join(' ')
	}
}

export namespace PriceFormatter {
	/**
	 * Formats a number or bigint to a currency-formatted string.
	 *
	 * @param value - The number or bigint to format.
	 * @returns The formatted string.
	 */
	export function format(
		value: number | bigint,
		decimalsOrOptions?:
			| number
			| {
					decimals?: number
					format?: 'short' | 'full'
			  },
	) {
		const options =
			typeof decimalsOrOptions === 'number'
				? { decimals: decimalsOrOptions }
				: (decimalsOrOptions ?? {})

		options.format ??= 'full'
		options.decimals ??= 0

		const normalizedValue =
			typeof value === 'number'
				? value
				: Number(Value.format(BigInt(value), options.decimals))

		if (normalizedValue > 0 && normalizedValue < 0.01) return '<$0.01'

		const formatter = options.format === 'short' ? numberIntlShort : numberIntl

		return formatter.format(normalizedValue)
	}

	/** @internal */
	const numberIntlShort = new Intl.NumberFormat('en-US', {
		notation: 'compact',
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
		currency: 'USD',
		style: 'currency',
	})

	/** @internal */
	const numberIntl = new Intl.NumberFormat('en-US', {
		notation: 'standard',
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
		currency: 'USD',
		style: 'currency',
	})

	const amountFormatter = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 18,
	})

	export function formatAmount(value: string): string {
		const number = Number(value)
		if (number > 0 && number < 0.01) return '<0.01'
		return amountFormatter.format(number)
	}

	export function formatNativeAmount(
		value: bigint | undefined,
		decimals: number,
		symbol: string,
	) {
		if (value === undefined) return '—'
		const decimalString = Value.format(value, decimals)
		const formatted = PriceFormatter.formatAmount(decimalString)
		return `${formatted} ${symbol}`
	}
	export function formatGasValue(value?: bigint, digits = 9) {
		if (value === undefined) return '—'
		const string = value.toString()
		return string.length >= digits ? string : string.padStart(digits, '0')
	}
}

export namespace NumberFormatter {
	export function formatBlockNumber(value?: bigint) {
		if (!value) return '—'
		const base = value.toString()
		return base.padStart(12, '0')
	}
}
