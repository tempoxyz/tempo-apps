import { style } from '@tempoxyz/ds/platform'

// Route components are code-split into modules that zyzz does not compile, so
// the demo receipt route's styles live here.

export namespace styles {
	export const page = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		flexGrow: 1,
		gap: '32',
		justifyContent: 'center',
		paddingBottom: '32',
		paddingTop: '64',
		typography: 'body.b3',
	})
}
