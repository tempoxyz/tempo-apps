import { style } from '@tempoxyz/ds/platform'
import { cx } from 'zyzz'
import { link, linkHover } from '#styles/explorer'

// Route components are code-split into modules that zyzz does not compile,
// so the policy route's styles live here.

export namespace styles {
	export const notFound = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		justifyContent: 'center',
		paddingInline: '16',
		paddingTop: '64',
	})

	export const notFoundContent = style({ textAlign: 'center' })

	export const notFoundTitle = style({
		color: 'content.primary',
		typography: 'heading.h1',
	})

	export const notFoundMessage = style({
		color: 'content.secondary',
		marginTop: '8',
		typography: 'body.b2',
	})

	export const page = style({
		display: 'grid',
		gap: '16',
		gridTemplateColumns: 'auto 1fr',
		minWidth: '0px !custom',
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

	export const card = style({
		alignSelf: 'start',
		'@media (width < 800px)': { width: '100% !custom' },
	})

	export const type = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const typeLabel = style({ textTransform: 'capitalize' })

	export const builtIn = style({ color: 'content.secondary' })

	// Touch devices keep 16px text so iOS does not zoom on focus.
	export const search = style({
		selectors: {
			'& input::placeholder': { color: 'content.secondary' },
		},
		'@media (pointer: coarse)': {
			selectors: { '& input': { fontSize: '16px !custom' } },
		},
	})

	export const event = style({ color: 'content.primary' })

	export const transaction = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
	})
}

// The route file cannot call `cx` (zyzz does not compile its chunks), so the
// link recipe composition is resolved here.
export namespace composed {
	export const textLink = cx(link(), linkHover())
}
