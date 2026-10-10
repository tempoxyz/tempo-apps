import { style, variants } from '@tempoxyz/ds/platform'
import { ping } from '#styles/explorer'

// Route components are code-split into modules that zyzz does not compile, so
// the address route's styles live here. Shared partial records stay at module
// scope: a non-style member inside `styles` stops zyzz from composing them.

const liveToggleBase = {
	alignItems: 'center',
	borderRadius: '3xs',
	display: 'flex',
	gap: '4',
	paddingBlock: '2',
	paddingInline: '8',
	typography: 'body.b3',
} as const

const paginationRowBase = {
	alignItems: 'center',
	color: 'content.tertiary',
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

// Compact pager controls in the TDS secondary IconButton style (round,
// container fill, no border). IconButton's smallest scale is 32px; the pager
// keeps its 24px geometry so table footers keep their height.
const pageControlBase = {
	alignItems: 'center',
	backgroundColor: 'container.regular',
	borderRadius: 'full',
	color: 'content.primary',
	cursor: 'pointer',
	display: 'flex',
	height: '24px !custom',
	justifyContent: 'center',
	width: '24px !custom',
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

	// InfoCard sets its own `w-fit` from 1240px; the portal card's fixed width
	// has to win over it, as tailwind-merge used to settle.
	export const zonePortalCard = style({
		'@media (width >= 800px)': { alignSelf: 'flex-start' },
		'@media (width >= 1240px)': { width: '258px !custom !important' },
	})

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

	export const addressLabel = style({ typography: 'body.b3' })

	export const copyWrap = style({
		alignItems: 'center',
		display: 'flex',
		position: 'relative',
	})

	export const icon12 = style({ height: '12px !custom', width: '12px !custom' })

	export const icon14 = style({ height: '14px !custom', width: '14px !custom' })

	export const copied = style({
		left: 'calc(100% + 8px) !custom',
		position: 'absolute',
		typography: 'body.b3',
	})

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
		color: 'content.tertiary',
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

	export const balanceToken = style({
		alignItems: 'center',
		color: 'content.positive',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const pending = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})

	export const value = style({
		color: 'content.primary',
		typography: 'body.b3',
	})

	export const primary = style({ color: 'content.primary' })

	export const secondary = style({ color: 'content.secondary' })

	export const tertiary = style({ color: 'content.tertiary' })

	export const streamError = style({
		color: 'content.negative',
		typography: 'body.b3',
	})

	// Live/paused chip. `live` uses TDS's positive container; its hover takes
	// the stronger positive tint (the `border.positive` alpha) in place of the
	// old 20% mix.
	export const liveToggle = variants({
		base: liveToggleBase,
		defaultVariants: { live: false, feed: false },
		variants: {
			live: {
				true: {
					backgroundColor: 'container.positive',
					color: 'content.positive',
					'@media (hover: hover)': {
						':hover': { backgroundColor: 'border.positive' },
					},
				},
				false: {
					backgroundColor: 'container.subtle',
					color: 'content.tertiary',
					'@media (hover: hover)': {
						':hover': { backgroundColor: 'container.regular' },
					},
				},
			},
			// The history/transfers feed toggle sits at the end of its toolbar and
			// can be disabled away from the newest page.
			feed: {
				true: {
					flexShrink: 0,
					marginLeft: 'auto !custom',
					':disabled': { cursor: 'not-allowed', opacity: 0.5 },
				},
				false: {},
			},
		},
	})

	export const pingWrap = style({
		display: 'flex',
		height: '8',
		position: 'relative',
		width: '8',
	})

	export const pingRing = style({
		animation: `${ping} 1s cubic-bezier(0, 0, 0.2, 1) infinite`,
		backgroundColor: 'content.positive',
		borderRadius: 'full',
		display: 'inline-flex',
		height: '100% !custom',
		opacity: 0.75,
		position: 'absolute',
		width: '100% !custom',
	})

	export const pingDot = style({
		backgroundColor: 'content.positive',
		borderRadius: 'full',
		display: 'inline-flex',
		height: '8',
		position: 'relative',
		width: '8',
	})

	export const errorCard = style({
		backgroundColor: 'background.secondary',
		borderRadius: 'xs',
		padding: '20',
	})

	export const errorTitle = style({
		color: 'content.negative',
		typography: 'body.b2Strong',
	})

	export const errorDetail = style({
		color: 'content.tertiary',
		marginTop: '4',
		typography: 'body.b3',
	})

	// Added to a TDS Button: only properties it leaves unset, plus a hover
	// (which outranks its resting fill).
	export const retryButton = style({
		marginTop: '12',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
	})

	export const timeHeader = style({
		color: 'content.secondary',
		cursor: 'pointer',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
	})

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

	export const assetLink = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		gap: '8',
		typography: 'body.b3',
	})

	export const percentage = style({
		color: 'content.primary',
		typography: 'body.b3',
	})

	export const infoLabel = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
	})

	export const infoIcon = style({
		color: 'content.tertiary',
		cursor: 'help',
		typography: 'body.b3',
	})

	export const batchPending = style({
		color: 'content.tertiary',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
	})

	export const batchCell = style({
		typography: 'body.b3',
		whiteSpace: 'nowrap',
	})

	export const hashLink = variants({
		base: { typography: 'body.b3', width: '100% !custom' },
		defaultVariants: { prominent: false },
		variants: {
			prominent: {
				true: { typography: 'body.b3Strong' },
				false: { color: 'content.tertiary' },
			},
		},
	})

	export const pageNav = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'center',
		'@media (width >= 640px)': { justifyContent: 'flex-start' },
	})

	export const pageLink = style({
		...pageControlBase,
		selectors: {
			'&[aria-disabled="true"]': { cursor: 'not-allowed', opacity: 0.5 },
		},
	})

	export const pageButton = style({
		...pageControlBase,
		':disabled': { cursor: 'not-allowed', opacity: 0.5 },
	})

	export const pageLabel = style({
		color: 'content.tertiary',
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

	export const unlistedRow = variants({
		base: {
			...dividerLine,
			alignItems: 'center',
			display: 'flex',
			justifyContent: 'center',
			paddingBlock: '12',
			paddingInline: '16',
			typography: 'body.b3',
		},
		defaultVariants: { divided: false },
		variants: {
			divided: { true: { borderTopWidth: 'regular' }, false: {} },
		},
	})

	export const unlistedToggle = style({
		alignItems: 'center',
		color: 'content.tertiary',
		cursor: 'pointer',
		display: 'inline-flex',
		gap: '8',
		'@media (hover: hover)': { ':hover': { color: 'content.secondary' } },
	})

	export const filter = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		typography: 'body.b3',
	})

	export const filterAccount = style({ typography: 'mono.inline' })

	export const clearIcon = style({
		height: '14px !custom',
		translate: '0 1px !custom',
		width: '14px !custom',
	})

	export const receipt = style({
		paddingBottom: '16',
		typography: 'body.b3',
	})

	export const settlement = style({
		alignItems: 'center',
		backgroundColor: 'container.subtle',
		borderBottomWidth: 'thick',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		display: 'flex',
		marginInline: '-16px !custom',
		paddingBlock: '12',
		paddingInline: '16',
	})

	export const rowIndex = style({
		color: 'content.tertiary',
		flexShrink: 0,
		fontVariantNumeric: 'tabular-nums',
		marginRight: '12',
		textAlign: 'right',
	})

	export const onChainLabel = style({
		flexShrink: 0,
		fontStyle: 'italic',
		typography: 'body.b3',
		width: '64px !custom',
	})

	export const offChainHeader = style({
		alignItems: 'center',
		color: 'content.tertiary',
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
		color: 'content.tertiary',
		flexShrink: 0,
		typography: 'body.b3',
		width: '64px !custom',
	})

	export const voucherParts = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		marginLeft: 'auto !custom',
	})
}
