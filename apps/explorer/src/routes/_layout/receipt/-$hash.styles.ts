import { style } from '@tempoxyz/ds/platform'

// zyzz excludes the receipt route because it imports server-only modules, so
// the route's styles live here.

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
		'@media print': { flexGrow: 0, paddingBottom: 'none', paddingTop: '32' },
	})
}
