import { style } from '@tempoxyz/ds/platform'
import { cx } from 'zyzz'
import { link, linkHover, pressDown, transitionColors } from '#styles/explorer'

// Route components are code-split into modules that zyzz does not compile, so
// the address route's styles live here. Shared partial records stay at module
// scope: a non-style member inside `styles` stops zyzz from composing them.

const paginationRowBase = {
	alignItems: 'center',
	color: 'content.secondary',
	display: 'flex',
	flexDirection: 'column',
	gap: '12',
	paddingBlock: '12',
	paddingInline: '16',
	typography: 'body.b3',
	'@media (width >= 640px)': {
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
} as const

// Pager controls share TDS IconButton `small` `secondary` geometry. The holdings
// pager uses IconButton itself; the history pager's controls are links.
const pagerHover = {
	'@media (hover: hover)': {
		':hover': { backgroundColor: 'container.strong' },
	},
} as const

// Divider borders: the reset leaves every border at width 0, so each use sets
// only the edge it draws.
const dividerLine = {
	borderColor: 'line.secondary',
	borderStyle: 'solid',
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
		'@media (width >= 1240px)': { maxWidth: '1280px !custom' },
	})

	export const breadcrumbs = style({ gridColumn: '1 / -1' })

	export const accountColumn = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		'@media (width >= 800px)': { alignSelf: 'flex-start' },
	})

	export const zonePortalCard = style({
		'@media (width >= 800px)': { alignSelf: 'flex-start' },
		'@media (width >= 1240px)': { width: '258px !custom' },
	})

	export const addressHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		marginBottom: '8',
	})

	export const addressLabel = style({ typography: 'body.b3' })

	export const icon12 = style({ height: '12', width: '12' })

	export const addressValue = style({
		color: 'content.primary',
		maxWidth: '21ch !custom',
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const balances = style({
		minWidth: '0 !custom',
		width: '100% !custom',
	})

	export const balancesLabel = style({
		color: 'content.secondary',
		marginBottom: '8',
		typography: 'body.b3',
	})

	export const balanceList = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const balanceRow = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		minWidth: '0 !custom',
		typography: 'body.b3',
	})

	export const pending = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const value = style({
		color: 'content.primary',
		typography: 'body.b3',
	})

	export const primary = style({ color: 'content.primary' })

	export const secondary = style({ color: 'content.secondary' })

	// Dashes that stand in for a missing value.
	export const placeholder = style({ color: 'content.tertiary' })

	// Added to a TDS Button: only properties it leaves unset. The history and
	// transfers feed toggle sits at the end of its toolbar and is disabled away
	// from the newest page.
	export const feedToggle = style({
		flexShrink: 0,
		marginLeft: 'auto !custom',
		':disabled': { opacity: 0.5 },
	})

	export const alertWrap = style({ padding: '16' })

	export const batchIndex = style({
		typography: 'mono.inline',
		whiteSpace: 'nowrap',
	})

	export const contextual = style({
		alignItems: 'center',
		display: 'flex',
		gap: '12',
	})

	export const paginationBar = style({
		...paginationRowBase,
		...dividerLine,
		borderTopWidth: 'regular',
	})

	export const holdingRow = style({ typography: 'body.b3' })

	export const infoLabel = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
	})

	// TDS Tooltip keeps its label on one line; the column hints are sentences.
	export const infoTooltip = style({
		selectors: { '& > span': { whiteSpace: 'normal' } },
	})

	export const batchPending = style({
		color: 'content.secondary',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
	})

	export const batchCell = style({
		typography: 'body.b3',
		whiteSpace: 'nowrap',
	})

	export const pageNav = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'center',
		'@media (width >= 640px)': { justifyContent: 'flex-start' },
	})

	// Added to a TDS IconButton: only properties it leaves unset, plus a hover
	// (which outranks its resting fill).
	export const pagerButton = style({
		...pagerHover,
		':disabled': { opacity: 0.5 },
	})

	export const pageLabel = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
		paddingInline: '4',
		whiteSpace: 'nowrap',
	})

	export const holdingsFooter = style({
		...dividerLine,
		borderTopWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: 'none',
	})

	export const holdingsPagination = style({ ...paginationRowBase })

	export const unlistedRow = style({
		...dividerLine,
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'center',
		paddingBlock: '8',
		paddingInline: '16',
		selectors: { '&:not(:first-child)': { borderTopWidth: 'regular' } },
	})

	// Added to a TDS Button: an icon size and a hover fill, both unset by it.
	export const unlistedToggle = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
		selectors: { '& > svg': { height: '16', width: '16' } },
	})

	export const filter = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		typography: 'body.b3',
	})

	export const receipt = style({
		paddingBottom: '16',
		typography: 'body.b3',
	})

	export const settlement = style({
		...dividerLine,
		alignItems: 'center',
		backgroundColor: 'container.subtle',
		borderBottomWidth: 'thick',
		display: 'flex',
		marginInline: '-16px !custom',
		paddingBlock: '12',
		paddingInline: '16',
	})

	export const rowIndex = style({
		color: 'content.secondary',
		flexShrink: 0,
		fontVariantNumeric: 'tabular-nums',
		marginRight: '12',
		textAlign: 'right',
	})

	export const onChainLabel = style({
		color: 'content.primary',
		flexShrink: 0,
		fontStyle: 'italic',
		typography: 'body.b3',
		width: '64',
	})

	export const offChainHeader = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		gap: '8',
		paddingBottom: '8',
		paddingTop: '12',
		typography: 'body.b3',
	})

	export const divider = style({
		...dividerLine,
		borderTopWidth: 'regular',
		flex: 1,
	})

	export const voucherRow = style({
		...dividerLine,
		alignItems: 'center',
		borderBottomWidth: 'regular',
		display: 'flex',
		paddingBlock: '8',
	})

	export const offChainLabel = style({
		color: 'content.secondary',
		flexShrink: 0,
		typography: 'body.b3',
		width: '64',
	})

	export const voucherParts = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		marginLeft: 'auto !custom',
	})
}

// Compositions with the shared recipes. The route file cannot call `cx` (zyzz
// does not compile its chunks, so conflicts would fall to stylesheet order), so
// they are resolved here and spread as-is.

const addressButton = style({
	color: 'content.secondary',
	cursor: 'pointer',
	textAlign: 'left',
	width: '100% !custom',
})

const balanceToken = style({
	alignItems: 'center',
	display: 'flex',
	gap: '8',
	minWidth: '0 !custom',
})

const timeHeader = style({
	color: 'content.secondary',
	cursor: 'pointer',
	'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
})

const assetLink = style({
	alignItems: 'center',
	color: 'content.primary',
	display: 'flex',
	gap: '8',
	typography: 'body.b3',
})

const hashLink = style({
	color: 'content.secondary',
	typography: 'body.b3',
	width: '100% !custom',
})

const hashLinkProminent = style({
	typography: 'body.b3Strong',
	width: '100% !custom',
})

const pageLink = style({
	...pagerHover,
	alignItems: 'center',
	backgroundColor: 'container.regular',
	borderRadius: 'full',
	color: 'content.primary',
	display: 'inline-flex',
	height: '32',
	justifyContent: 'center',
	width: '32',
	selectors: {
		'& > svg': { height: '16', width: '16' },
		'&[aria-disabled="true"]': { cursor: 'default', opacity: 0.5 },
	},
})

const filterAccount = style({ typography: 'mono.inline' })

// TDS IconButton `small` `tertiary` geometry on a link.
const clearFilter = style({
	alignItems: 'center',
	borderRadius: 'full',
	color: 'content.primary',
	display: 'inline-flex',
	height: '32',
	justifyContent: 'center',
	width: '32',
	'@media (hover: hover)': {
		':hover': { backgroundColor: 'container.regular' },
	},
	selectors: { '& > svg': { height: '16', width: '16' } },
})

export namespace composed {
	export const zoneAddress = cx(addressButton(), pressDown())

	export const zoneBalanceToken = cx(
		balanceToken(),
		link(),
		linkHover(),
		pressDown(),
	)

	export const timeColumnHeader = cx(timeHeader(), transitionColors())

	export const transferAsset = cx(
		assetLink(),
		linkHover(),
		transitionColors(),
		pressDown(),
	)

	export const batchLink = cx(
		link(),
		linkHover(),
		transitionColors(),
		pressDown(),
	)

	export const txHash = cx(hashLink(), pressDown())

	export const txHashProminent = cx(
		hashLinkProminent(),
		link(),
		linkHover(),
		transitionColors(),
		pressDown(),
	)

	export const historyPageLink = cx(pageLink(), pressDown())

	export const filterAccountLink = cx(
		filterAccount(),
		link(),
		linkHover(),
		pressDown(),
	)

	export const clearFilterLink = cx(clearFilter(), pressDown())
}
