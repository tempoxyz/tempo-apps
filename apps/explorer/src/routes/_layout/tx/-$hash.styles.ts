import { style } from '@tempoxyz/ds/platform'

// Route components are code-split into modules that zyzz does not compile, so
// the transaction route's styles live here. Shared partial records stay at
// module scope: a non-style member inside `styles` stops zyzz composing them.

// Overview rows that InfoRow cannot express keep its geometry and dividers.
const overviewRow = {
	borderBottomWidth: 'regular',
	borderColor: 'line.secondary',
	borderStyle: 'solid',
	display: 'flex',
	flexDirection: 'column',
	paddingBlock: '12',
	paddingInline: '20',
} as const

const divided = {
	selectors: {
		'& > :not(:last-child)': {
			borderBottomWidth: 'regular',
			borderColor: 'line.secondary',
		},
	},
} as const

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

	export const tertiary = style({ color: 'content.tertiary' })

	export const positive = style({ color: 'content.positive' })

	export const infoRow = style({ ...overviewRow })

	export const infoRowLast = style({
		...overviewRow,
		':last-child': { borderBottomWidth: 'none' },
	})

	export const infoRowBody = style({
		alignItems: 'flex-start',
		display: 'flex',
		gap: '16',
	})

	// Matches InfoRow's label column.
	export const infoRowLabel = style({
		color: 'content.tertiary',
		flexShrink: '0 !custom',
		minWidth: '140px !custom',
		typography: 'body.b2',
	})

	export const infoRowValue = style({ flex: 1 })

	export const balances = style({
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		gap: '4',
		minWidth: '0 !custom',
	})

	export const balanceAccounts = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		maxHeight: '360px !custom',
		overflowY: 'auto',
		paddingBottom: '8',
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

	export const balanceDiff = style({
		color: 'content.secondary',
		flexShrink: '0 !custom',
		fontVariantNumeric: 'tabular-nums',
	})

	export const balanceToken = style({
		alignItems: 'center',
		color: 'content.positive',
		display: 'inline-flex',
		flexShrink: '0 !custom',
		gap: '4',
	})

	export const balanceTokenIcon = style({ height: '16', width: '16' })

	// Compact toggle in the TDS secondary Button style (pill, container fill).
	export const pill = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderRadius: 'full',
		color: 'content.primary',
		cursor: 'pointer',
		display: 'inline-flex',
		gap: '4',
		paddingBlock: '4',
		paddingInline: '12',
		typography: 'body.b3',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
	})

	export const seeAll = style({ width: 'fit-content !custom' })

	export const seeAllIcon = style({
		height: '12px !custom',
		width: '12px !custom',
	})

	export const calls = style({
		...divided,
		display: 'flex',
		flexDirection: 'column',
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

	export const empty = style({
		color: 'content.tertiary',
		paddingBlock: '24',
		paddingInline: '20',
		textAlign: 'center',
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
