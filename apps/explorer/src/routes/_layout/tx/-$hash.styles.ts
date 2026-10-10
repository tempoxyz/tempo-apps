import { style } from '@tempoxyz/ds/platform'

// Route components are code-split into modules that zyzz does not compile, so
// the transaction route's styles live here.

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

	export const breadcrumbs = style({ gridColumn: '1 / -1' })

	export const card = style({ alignSelf: 'flex-start' })

	export const column = style({ display: 'flex', flexDirection: 'column' })

	export const description = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const stack = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0 !custom',
	})

	export const primary = style({ color: 'content.primary' })

	export const secondary = style({ color: 'content.secondary' })

	export const balances = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0 !custom',
	})

	// The list scrolls, so link focus rings inside it are drawn inset.
	export const balanceAccounts = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		maxHeight: '360px !custom',
		overflowY: 'auto',
		paddingBottom: '8',
		selectors: { '& a:focus-visible': { outlineOffset: '-2px' } },
	})

	export const balanceAccount = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		typography: 'body.b3',
	})

	export const balanceChanges = style({
		borderColor: 'line.secondary',
		borderLeftWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
		paddingLeft: '12',
	})

	export const balanceChange = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	// TextButton leaves its alignment in a column unset.
	export const seeAll = style({ alignSelf: 'flex-start' })

	export const calls = style({
		display: 'flex',
		flexDirection: 'column',
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: 'regular',
				borderColor: 'line.secondary',
			},
		},
	})

	export const call = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		paddingBlock: '16',
		paddingInline: '20',
	})

	export const callHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		typography: 'body.b3',
	})

	export const eventLogs = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
	})

	export const eventCell = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		width: '100% !custom',
	})

	export const raw = style({
		paddingBlock: '12',
		paddingInline: '20',
		typography: 'body.b3',
		wordBreak: 'break-all',
	})
}
