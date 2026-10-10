import { style } from '@tempoxyz/ds/platform'
import { rowShimmer } from '#styles/explorer'

// Route components are code-split into modules that zyzz does not compile,
// so the blocks route's styles live here.

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

	// TDS Button small secondary geometry on a link.
	export const liveToggle = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderRadius: 'full',
		display: 'inline-flex',
		height: '32',
		justifyContent: 'center',
		minWidth: '80px !custom',
		paddingInline: '16',
		textDecorationLine: 'none',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
	})

	export const number = style({
		fontVariantNumeric: 'tabular-nums',
		fontWeight: 500,
	})

	export const hash = style({
		minWidth: '0px !custom',
		typography: 'mono.inline',
		width: '100% !custom',
	})

	export const time = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
		whiteSpace: 'nowrap',
	})

	export const txns = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
	})

	// Newest live block row: a positive tint that fades out. Starting at peak
	// tint keeps it smooth when a new block interrupts it. Passed to the
	// DataGrid row, which sets no animation of its own.
	export const liveRow = style({
		animation: `${rowShimmer} 0.5s ease-out 1`,
	})

	export const pagination = style({
		alignItems: 'center',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
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
	})

	export const paginationControls = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'center',
		'@media (width >= 640px)': { justifyContent: 'flex-start' },
	})

	// TDS IconButton small secondary geometry on a link.
	export const pageButton = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderRadius: 'full',
		color: 'content.primary',
		display: 'inline-flex',
		flexShrink: 0,
		height: '32',
		justifyContent: 'center',
		width: '32',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
		selectors: {
			'& > svg': { height: '16', width: '16' },
			'&[aria-disabled="true"]': {
				backgroundColor: 'container.subtle',
				color: 'content.tertiary',
				cursor: 'default',
			},
		},
	})

	export const pageRange = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		paddingInline: '4',
		typography: 'body.b3Strong',
		whiteSpace: 'nowrap',
	})

	export const pageCount = style({ fontVariantNumeric: 'tabular-nums' })
}
