import { style } from '@tempoxyz/ds/platform'

// Route components are code-split into modules that zyzz does not compile,
// so the block route's styles live here.

export namespace styles {
	export const page = style({
		display: 'grid',
		gap: '16',
		gridTemplateColumns: 'auto 1fr',
		minWidth: '0px !custom',
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
		'@media (width >= 1240px)': { maxWidth: '1280px !custom' },
	})

	export const breadcrumbs = style({ gridColumn: '1 / -1' })

	export const card = style({
		alignSelf: 'start',
		'@media (width < 800px)': { alignSelf: 'stretch' },
	})

	export const systemFrom = style({
		color: 'content.secondary',
		overflow: 'hidden',
		textAlign: 'right',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		width: '100% !custom',
	})

	export const hashLink = style({ width: '100% !custom' })

	export const primary = style({ color: 'content.primary' })

	export const secondary = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
	})

	export const call = style({
		color: 'content.primary',
		display: 'flex',
		flex: 1,
		gap: '8',
	})

	export const send = style({
		color: 'content.primary',
		whiteSpace: 'nowrap',
	})
}
