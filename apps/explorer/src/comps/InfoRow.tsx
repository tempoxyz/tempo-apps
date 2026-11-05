import { ListGroup, style } from '@tempoxyz/ds'

/** A key-value row of one record. Place it in a `ListGroup.Root`. */
export function InfoRow(props: InfoRow.Props): React.JSX.Element {
	const { label, children, stackOnMobile = false } = props
	const content = (
		<>
			<ListGroup.Label>{label}</ListGroup.Label>
			{children}
		</>
	)
	return (
		<ListGroup.Row>
			{stackOnMobile ? <span {...styles.stack()}>{content}</span> : content}
		</ListGroup.Row>
	)
}

export declare namespace InfoRow {
	type Props = {
		label: string
		children: React.ReactNode
		/** Puts a long value under its label below 640px. */
		stackOnMobile?: boolean | undefined
	}
}

namespace styles {
	// `ListGroup.Row` keeps the label and value on one line. Below 640px a long
	// value gets the full row width under its label instead.
	export const stack = style({
		display: 'flex',
		flexDirection: 'column',
		flexGrow: '1 !custom',
		minWidth: '0',
		rowGap: '8',
		'@media 640': {
			alignItems: 'center',
			columnGap: '12',
			flexDirection: 'row',
		},
	})
}
