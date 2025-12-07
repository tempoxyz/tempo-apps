import * as React from 'react'
import { DateFormatter } from '#lib/formatting'

export function RelativeTime(props: RelativeTime.Props) {
	const { timestamp, ...props_ } = props
	const timeProps = RelativeTime.useRelativeTime<HTMLTimeElement>(timestamp)
	return <time {...timeProps} {...props_} />
}

export namespace RelativeTime {
	export interface Props extends React.HTMLAttributes<HTMLTimeElement> {
		timestamp: bigint
	}

	export function useRelativeTime<T extends HTMLElement = HTMLElement>(
		timestamp: bigint,
	) {
		const ref = React.useRef<T>(null)
		const prev = React.useRef<string>('')

		React.useEffect(() => {
			const updateTime = () => {
				if (!ref.current) return
				const { text } = DateFormatter.formatRelativeTime(timestamp)
				if (text === prev.current) return
				ref.current.textContent = prev.current = text
			}

			updateTime()
			const interval = setInterval(updateTime, 1000)
			return () => clearInterval(interval)
		}, [timestamp])

		const { text, fullDate } = DateFormatter.formatRelativeTime(timestamp)
		const iso = new Date(Number(timestamp) * 1_000).toISOString()

		return {
			ref,
			title: fullDate,
			children: text,
			dateTime: iso,
		}
	}
}
