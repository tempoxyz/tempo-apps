import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
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
			<div {...styles.root()}>
				<Link to={link} preload="intent" {...styles.link()}>
					<FormattedTimestamp timestamp={timestamp} format={format} />
				</Link>
			</div>
		)
	}

	return (
		<FormattedTimestamp
			timestamp={timestamp}
			format={format}
			className={className ?? styles.timestamp().className}
		/>
	)
}

namespace styles {
	export const root = style({ textWrap: 'nowrap' })

	export const link = style({
		color: 'content.tertiary',
		'@media (hover: hover)': { ':hover': { color: 'content.secondary' } },
	})

	export const timestamp = style({ color: 'content.tertiary' })
}
