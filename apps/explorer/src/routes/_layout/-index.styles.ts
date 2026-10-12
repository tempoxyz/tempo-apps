import { style } from '@tempoxyz/ds/platform'

// Route components are code-split into modules that zyzz does not compile,
// so the landing route's styles live here.

export namespace styles {
	export const page = style({
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		typography: 'body.b1',
		width: '100% !custom',
	})

	export const hero = style({
		display: 'flex',
		flexDirection: 'column',
		justifyContent: 'flex-end',
		minHeight: '42svh !custom',
	})

	export const logo = style({
		color: 'content.primary',
		display: 'flex',
		justifyContent: 'center',
		margin: 'none',
		userSelect: 'none',
		'@media (height <= 360px)': { display: 'none' },
	})

	// Sized like a search engine's home logo; the header hides its own on this page.
	export const wordmark = style({
		display: 'block',
		height: '48',
		width: 'auto !custom',
		'@media (width >= 800px)': { height: '64' },
	})

	export const body = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		flexGrow: 1,
		gap: '32',
		paddingInline: '16',
		paddingTop: '32',
	})

	export const search = style({
		maxWidth: '560px !custom',
		position: 'relative',
		width: '100% !custom',
		zIndex: 20,
	})

	export const spotlight = style({
		maxWidth: '560px !custom',
		paddingInline: '16',
		textAlign: 'center',
	})

	export const pills = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		justifyContent: 'center',
	})

	// TDS Button small secondary geometry on a link.
	export const pill = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderRadius: 'full',
		color: 'content.primary',
		columnGap: '4',
		display: 'inline-flex',
		height: '32',
		justifyContent: 'center',
		minWidth: '80px !custom',
		paddingInline: '16',
		textDecorationLine: 'none',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
	})
}
