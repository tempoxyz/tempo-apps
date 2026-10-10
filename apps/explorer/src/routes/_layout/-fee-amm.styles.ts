import { style } from '@tempoxyz/ds/platform'

// Route components are code-split into modules that zyzz does not compile,
// so the Fee AMM route's styles live here.

export namespace styles {
	export const error = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingInline: '16',
		paddingTop: '64',
	})

	export const errorTitle = style({
		color: 'content.primary',
		typography: 'heading.h3',
	})

	export const page = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '24',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingBottom: '64',
		paddingInline: '16',
		paddingTop: '32',
		width: '100% !custom',
		'@media (width >= 640px)': { paddingTop: '64' },
	})

	export const header = style({
		alignItems: 'flex-start',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '16',
		justifyContent: 'space-between',
	})

	export const intro = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		minWidth: '0px !custom',
	})

	export const title = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		gap: '12',
		typography: 'heading.h1',
	})

	export const description = style({
		color: 'content.secondary',
		maxWidth: '680px !custom',
		typography: 'body.b2',
	})

	export const filtered = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		typography: 'body.b2',
	})

	export const filteredToken = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'inline-flex',
		gap: '8',
	})

	export const filteredAddress = style({
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	// CopyButton is a TDS IconButton, which owns its size, fill, and radius.
	export const copyLink = style({ typography: 'body.b3' })

	export const form = style({
		alignItems: 'flex-end',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
	})

	export const field = style({
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		gap: '8',
		minWidth: '220px !custom',
	})

	export const label = style({
		color: 'content.tertiary',
		typography: 'body.b2',
	})

	// Mirrors TDS TextInput (filled) at the medium button height. Mobile keeps
	// 16px text so iOS does not zoom the page on focus.
	export const input = style({
		backgroundColor: 'component.input.primary.fill',
		borderColor: 'transparent !custom',
		borderRadius: 'xs',
		borderWidth: 'regular',
		color: 'content.primary',
		fontFamily: '"JetBrains Mono", monospace',
		fontSize: '16px',
		height: '40',
		lineHeight: '22px',
		minWidth: '0px !custom',
		paddingInline: '16',
		width: '100% !custom',
		'::placeholder': { color: 'content.tertiary' },
		':focus': { borderColor: 'border.focus' },
		'@media (width >= 640px)': { typography: 'mono.inline' },
		selectors: {
			'&[aria-invalid="true"]': { borderColor: 'border.negative' },
		},
	})

	// TDS Button sizes SVG children itself only in IconButton.
	export const buttonIcon = style({ height: '16', width: '16' })

	export const clear = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '8',
		paddingBlock: '8',
		typography: 'body.b2',
	})

	export const icon = style({ height: '14px !custom', width: '14px !custom' })

	export const filterError = style({
		color: 'content.negative',
		typography: 'body.b2',
		width: '100% !custom',
	})

	export const summary = style({
		alignItems: 'center',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'dashed',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '16',
		justifyContent: 'space-between',
		paddingBlock: '12',
		paddingInline: '16',
	})

	export const summaryNote = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
	})

	export const meta = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})

	export const total = style({ textAlign: 'right' })

	export const totalValue = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		typography: 'body.b2',
	})

	export const empty = style({
		color: 'content.secondary',
		paddingBlock: '40',
		paddingInline: '16',
		textAlign: 'center',
		typography: 'body.b2',
	})

	export const pagination = style({
		alignItems: 'center',
		borderColor: 'line.secondary',
		borderStyle: 'dashed',
		borderTopWidth: 'regular',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '16',
		justifyContent: 'space-between',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const pager = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const pageLabel = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
		paddingInline: '8',
	})

	export const limit = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		gap: '8',
		typography: 'body.b3',
	})

	// Mirrors TDS NativeSelect at a compact height.
	export const select = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: '2xs',
		borderWidth: 'regular',
		color: 'content.primary',
		height: '32',
		paddingInline: '8',
		typography: 'body.b3',
	})

	export const capped = style({
		color: 'content.secondary',
		paddingBottom: '16',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const footnote = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})
}
