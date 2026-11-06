import { ListGroup, Skeleton, style } from '@tempoxyz/ds'
import type * as React from 'react'

/**
 * Placeholder rows for a `ListGroup` while it loads, each a `Skeleton` line,
 * in a list marked busy and named for what is loading.
 */
export function ListGroupLoader(
	props: ListGroupLoader.Props,
): React.JSX.Element {
	const { label, rows = 3 } = props
	return (
		<ListGroup.Root aria-busy aria-label={label}>
			{Array.from({ length: rows }, (_, index) => (
				<ListGroup.Row aria-hidden key={index}>
					<Skeleton {...styles.line()} />
				</ListGroup.Row>
			))}
		</ListGroup.Root>
	)
}

export declare namespace ListGroupLoader {
	type Props = {
		/** Names what is loading, such as "Loading transactions". */
		label: string
		rows?: number | undefined
	}
}

namespace styles {
	export const line = style({ height: '16', width: '100% !custom' })
}
