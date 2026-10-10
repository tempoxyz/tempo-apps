import { style } from '@tempoxyz/ds/platform'
import { cx } from 'zyzz'
import { pressDown } from '#styles/explorer'

// Route components are code-split into modules that zyzz does not compile, so
// the demo address route's styles live here.

export namespace styles {
	export const page = style({
		display: 'grid',
		gap: '16',
		gridTemplateColumns: 'auto 1fr',
		minWidth: '0 !custom',
		paddingBottom: '64',
		paddingInline: '16',
		paddingTop: '64',
		width: '100% !custom',
		'@media (width < 800px)': {
			display: 'flex',
			flexDirection: 'column',
			paddingBottom: '32',
			paddingTop: '40',
		},
		'@media (width >= 1240px)': { maxWidth: '1080px !custom' },
	})

	export const accountCard = style({ alignSelf: 'flex-start' })

	export const addressHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		marginBottom: '8',
	})

	export const addressLabel = style({
		textTransform: 'capitalize',
		typography: 'body.b3',
	})

	export const copyIcon = style({ height: '12', width: '12' })

	export const addressValue = style({
		color: 'content.primary',
		maxWidth: '21ch !custom',
		typography: 'body.b2',
		wordBreak: 'break-all',
	})

	export const pending = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const value = style({
		color: 'content.primary',
		typography: 'body.b3',
	})

	// TxEventDescription sets flexWrap on the same element.
	export const collapsedEvent = style({
		flexWrap: 'nowrap !important',
		justifyContent: 'center',
	})

	export const collapsed = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		height: '20',
		whiteSpace: 'nowrap',
	})
}

// Compositions with the shared recipes. The route file cannot call `cx` (zyzz
// does not compile its chunks), so they are resolved here and spread as-is.

const addressButton = style({
	color: 'content.secondary',
	cursor: 'pointer',
	textAlign: 'left',
	width: '100% !custom',
})

const more = style({
	color: 'content.secondary',
	cursor: 'pointer',
	flexShrink: 0,
	marginLeft: '4',
})

export namespace composed {
	export const accountAddress = cx(addressButton(), pressDown())

	export const moreEvents = cx(more(), pressDown())
}
