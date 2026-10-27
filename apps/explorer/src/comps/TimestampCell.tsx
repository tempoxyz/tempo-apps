import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds'
import type * as React from 'react'
import { FormattedTimestamp, type TimeFormat } from '#comps/TimeFormat'

export function TimestampCell(props: TimestampCell.Props): React.JSX.Element {
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

export declare namespace TimestampCell {
	type Props = {
		timestamp: bigint
		link?: string | undefined
		format?: TimeFormat | undefined
		className?: string | undefined
	}
}

namespace styles {
	export const root = style({ textWrap: 'nowrap' })

	export const link = style({
		color: 'gray.900',
		'@media (hover: hover)': { ':hover': { color: 'foreground' } },
	})

	export const timestamp = style({ color: 'gray.900' })
}
