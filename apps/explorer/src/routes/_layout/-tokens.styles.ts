import { style } from '@tempoxyz/ds/platform'

// Route components are code-split into modules that zyzz does not compile,
// so the tokens route's styles live here.

export namespace styles {
	export const page = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '24',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingBottom: '64',
		paddingInline: '16',
		paddingTop: '64',
		width: '100% !custom',
	})

	export const tokenCell = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0 !custom',
	})

	export const symbol = style({
		alignItems: 'center',
		color: 'content.positive',
		display: 'inline-flex',
		gap: '8',
		minWidth: '0 !custom',
		typography: 'body.b2Strong',
	})

	export const name = style({ maxWidth: '40ch !custom' })

	export const secondary = style({ color: 'content.secondary' })

	export const tertiary = style({ color: 'content.tertiary' })

	export const holders = style({
		color: 'content.secondary',
		fontFamily: 'Pilat, Arial, sans-serif',
	})

	export const address = style({ width: '100% !custom' })
}
