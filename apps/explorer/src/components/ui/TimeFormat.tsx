import * as React from 'react'
import { RelativeTime } from '#components/ui/RelativeTime'

export type TimeFormat = 'relative' | 'local' | 'utc' | 'unix'

export function useTimeFormat(initialFormat: TimeFormat = 'relative') {
	const [timeFormat, setTimeFormat] = React.useState<TimeFormat>(initialFormat)

	const cycleTimeFormat = React.useCallback(() => {
		setTimeFormat((current) => {
			if (current === 'relative') return 'local'
			if (current === 'local') return 'utc'
			if (current === 'utc') return 'unix'
			return 'relative'
		})
	}, [])

	const formatLabel = React.useMemo(() => {
		if (timeFormat === 'relative') return 'relative'
		if (timeFormat === 'local') return 'local'
		if (timeFormat === 'utc') return 'UTC'
		return 'unix'
	}, [timeFormat])

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
