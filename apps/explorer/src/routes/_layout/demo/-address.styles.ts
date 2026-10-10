import { style } from '@tempoxyz/ds/platform'

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

	export const addressButton = style({
		color: 'content.tertiary',
		cursor: 'pointer',
		textAlign: 'left',
		width: '100% !custom',
	})

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

	export const copyWrap = style({
		alignItems: 'center',
		display: 'flex',
		position: 'relative',
	})

	export const copyIcon = style({
		height: '12px !custom',
		width: '12px !custom',
	})

	export const copied = style({
		left: 'calc(100% + 8px) !custom',
		position: 'absolute',
		typography: 'body.b3',
	})

	export const addressValue = style({
		color: 'content.primary',
		maxWidth: '21ch !custom',
		typography: 'body.b2',
		wordBreak: 'break-all',
	})

	export const pending = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})

	export const value = style({
		color: 'content.primary',
		typography: 'body.b3',
	})

	// TxEventDescription already lays its parts out as a wrapping flex row;
	// these only add what it leaves unset.
	export const expandedEvent = style({ width: 'auto !custom' })

	// `flex-nowrap` has to beat the component's own `flex-wrap`, which
	// tailwind-merge used to settle.
	export const collapsedEvent = style({
		flexWrap: 'nowrap !important',
		justifyContent: 'center',
		width: 'auto !custom',
	})

	export const collapsed = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		height: '20',
		whiteSpace: 'nowrap',
	})

	export const more = style({
		color: 'content.secondary',
		cursor: 'pointer',
		flexShrink: 0,
		marginLeft: '4',
	})
}
