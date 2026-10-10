import { style, vars } from '@tempoxyz/ds/platform'
import { cx } from 'zyzz'
import { link, linkHover } from '#styles/explorer'

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

	export const form = style({
		alignItems: 'flex-end',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
	})

	// TextInput caps itself at 320px; addresses need the full row. Touch
	// devices keep 16px text so iOS does not zoom on focus.
	export const field = style({
		flex: 1,
		minWidth: '220px !custom',
		selectors: { '& > div': { width: '100% !custom' } },
		'@media (pointer: coarse)': {
			selectors: { '& input': { fontSize: '16px !custom' } },
		},
	})

	export const control = style({
		'::placeholder': { color: 'content.secondary' },
		selectors: {
			'&[aria-invalid="true"]': {
				boxShadow: `inset 0 0 0 1px ${vars.color.border.negative} !custom`,
			},
		},
	})

	// TDS Button sizes SVG children itself only in IconButton.
	export const buttonIcon = style({ height: '16', width: '16' })

	export const filterError = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		gap: '4',
		typography: 'body.b2',
		width: '100% !custom',
	})

	export const filterErrorIcon = style({
		color: 'content.negative',
		flexShrink: 0,
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

	export const meta = style({
		color: 'content.secondary',
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
		display: 'flex',
		gap: '8',
	})

	export const limitLabel = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const capped = style({
		color: 'content.secondary',
		paddingBottom: '16',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const footnote = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})
}

// Compositions with the shared link recipes. The route file cannot call `cx`
// (zyzz does not compile its chunks), so they are resolved here.

const filteredAddress = style({
	typography: 'mono.inline',
	wordBreak: 'break-all',
})

const clearFilter = style({
	alignItems: 'center',
	display: 'inline-flex',
	gap: '8',
	paddingBlock: '8',
	typography: 'body.b2',
})

export namespace composed {
	export const textLink = cx(link(), linkHover())

	export const filteredAddressLink = cx(filteredAddress(), link(), linkHover())

	export const clearFilterLink = cx(clearFilter(), link(), linkHover())
}
