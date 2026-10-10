import { style } from '@tempoxyz/ds/platform'

// Route components are code-split into modules that zyzz does not compile,
// so the pagination demo's styles live here.

export namespace styles {
	export const page = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		flexGrow: 1,
		gap: '32',
		paddingBottom: '32',
		paddingTop: '64',
		typography: 'body.b3',
	})

	export const title = style({ color: 'content.secondary' })

	export const examples = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '24',
		maxWidth: '800px !custom',
		width: '100% !custom',
	})

	export const example = style({
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		overflow: 'hidden',
	})

	export const exampleLabel = style({
		backgroundColor: 'background.secondary',
		color: 'content.secondary',
		paddingBlock: '8',
		paddingInline: '16',
		typography: 'body.b3',
	})

	export const exampleBody = style({ backgroundColor: 'background.secondary' })
}
