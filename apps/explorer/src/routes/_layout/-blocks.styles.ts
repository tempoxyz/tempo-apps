import { style, variants, vars } from '@tempoxyz/ds/platform'
import { keyframes } from 'zyzz/web'
import { ping } from '#styles/explorer'

// Route components are code-split into modules that zyzz does not compile,
// so the blocks route's styles live here.

// Newest live block row: a positive-tinted flash that fades out. Starting at
// peak tint and decaying keeps it smooth when a new block interrupts it.
const blocksRowShimmer = keyframes({
	from: { backgroundColor: vars.color.container.positive },
	to: { backgroundColor: 'transparent' },
})

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

	export const liveToggle = variants({
		base: {
			alignItems: 'center',
			borderRadius: '3xs',
			display: 'flex',
			gap: '4',
			paddingBlock: '2',
			paddingInline: '8',
			textDecorationLine: 'none',
			typography: 'body.b3',
		},
		defaultVariants: { live: false },
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
		},
	})

	export const liveDot = style({
		display: 'flex',
		height: '8',
		position: 'relative',
		width: '8',
	})

	export const liveDotPing = style({
		animation: `${ping} 1s cubic-bezier(0, 0, 0.2, 1) infinite`,
		backgroundColor: 'content.positive',
		borderRadius: 'full',
		display: 'inline-flex',
		height: '100% !custom',
		opacity: 0.75,
		position: 'absolute',
		width: '100% !custom',
	})

	export const liveDotCore = style({
		backgroundColor: 'content.positive',
		borderRadius: 'full',
		display: 'inline-flex',
		height: '8',
		position: 'relative',
		width: '8',
	})

	export const pausedIcon = style({
		height: '12px !custom',
		width: '12px !custom',
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

	// Passed to the DataGrid row, which sets no animation of its own.
	export const liveRow = style({
		animation: `${blocksRowShimmer} 0.5s ease-out 1`,
	})

	export const pagination = style({
		alignItems: 'center',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
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
	})

	export const paginationControls = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'center',
		'@media (width >= 640px)': { justifyContent: 'flex-start' },
	})

	// Compact pager controls in the TDS secondary IconButton style (round,
	// container fill). IconButton's smallest scale is 32px; the pager keeps its
	// 24px geometry so the table footer keeps its height.
	export const pageButton = style({
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
		':active': { translate: '0 0.5px !custom' },
		selectors: {
			'&[aria-disabled="true"]': { cursor: 'not-allowed', opacity: 0.5 },
		},
	})

	export const pageIcon = style({
		height: '14px !custom',
		width: '14px !custom',
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
