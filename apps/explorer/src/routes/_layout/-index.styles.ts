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

	export const words = style({
		display: 'flex',
		justifyContent: 'center',
		userSelect: 'none',
		'@media (height <= 360px)': { display: 'none' },
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
		typography: 'body.b3',
	})

	export const pillIcon = style({
		flexShrink: 0,
		height: '14px !custom',
		width: '14px !custom',
	})

	// A link in the TDS small secondary Button style.
	export const pill = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderRadius: 'full',
		color: 'content.secondary',
		display: 'flex',
		gap: '8',
		height: '32',
		paddingInline: '12',
		textDecorationLine: 'none',
		'@media (hover: hover)': {
			':hover': {
				backgroundColor: 'container.strong',
				color: 'content.primary',
			},
		},
	})

	export const landingWords = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
	})

	// The hero steps up in size and contrast. TDS has two display sizes, so
	// the first two words share the smaller one.
	export const wordSearch = style({
		color: 'content.tertiary',
		typography: 'display.d2',
	})

	export const wordExplore = style({
		color: 'content.secondary',
		typography: 'display.d2',
	})

	export const wordDiscover = style({
		color: 'content.primary',
		typography: 'display.d1',
	})
}
