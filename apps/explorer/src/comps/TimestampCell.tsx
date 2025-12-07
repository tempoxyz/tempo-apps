import { Link } from '@tanstack/react-router'
import { FormattedTimestamp, type TimeFormat } from '#comps/TimeFormat'

export function TimestampCell(props: {
	timestamp: bigint
	link?: string
	format?: TimeFormat
	className?: string
}) {
	const { timestamp, link, format = 'relative', className } = props

	if (link) {
		return (
			<div className="text-nowrap">
				<Link to={link} className="text-tertiary hover:text-secondary">
					<FormattedTimestamp timestamp={timestamp} format={format} />
				</Link>
			</div>
		)
	}

	return (
		<FormattedTimestamp
			timestamp={timestamp}
			format={format}
			className={className ?? 'text-tertiary'}
		/>
	)
}
