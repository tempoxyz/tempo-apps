import * as React from 'react'
import { RelativeTime } from '#comps/RelativeTime'
import {
	cycleTimeFormat,
	getServerTimeFormat,
	getTimeFormat,
	setTimeFormat,
	subscribeTimeFormat,
	type TimeFormat,
} from '#lib/time-format'

export type { TimeFormat } from '#lib/time-format'

export function useTimeFormat() {
	const timeFormat = React.useSyncExternalStore(
		subscribeTimeFormat,
		getTimeFormat,
		getServerTimeFormat,
	)
	const formatLabel = timeFormat === 'utc' ? 'UTC' : timeFormat

	return { timeFormat, setTimeFormat, cycleTimeFormat, formatLabel }
}

export function FormattedTimestamp(props: {
	timestamp: bigint
	format: TimeFormat
	className?: string
}) {
	const { timestamp, format, className } = props
	const date = new Date(Number(timestamp) * 1000)

	if (format === 'relative') {
		return <RelativeTime timestamp={timestamp} className={className} />
	}

	if (format === 'unix') {
		return (
			<time dateTime={date.toISOString()} className={className}>
				{timestamp.toString()}
			</time>
		)
	}

	if (format === 'local') {
		const formatted = new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
		}).format(date)
		const tz =
			new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
				.formatToParts(date)
				.find((p) => p.type === 'timeZoneName')?.value ?? ''
		return (
			<time dateTime={date.toISOString()} className={className}>
				{formatted} {tz}
			</time>
		)
	}

	// utc
	const formatted = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
		timeZone: 'UTC',
	}).format(date)
	return (
		<time dateTime={date.toISOString()} className={className}>
			{formatted} UTC
		</time>
	)
}

export function TimeColumnHeader(props: {
	label?: string
	formatLabel: string
	onCycle: () => void
	className?: string
}) {
	const { label = 'Time', formatLabel, onCycle, className } = props
	return (
		<button
			type="button"
			onClick={onCycle}
			className={className}
			title={`Showing ${formatLabel} time - click to change`}
		>
			{label}
		</button>
	)
}
