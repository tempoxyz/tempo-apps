import { style } from '@tempoxyz/ds/platform'

// Route components are code-split into modules that zyzz does not compile,
// so the countdown route's styles live here.

export namespace styles {
	export const page = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		gap: '32',
		justifyContent: 'center',
		minHeight: 'calc(100vh - 200px) !custom',
		paddingBottom: '64',
		paddingInline: '16',
		paddingTop: '64',
		width: '100% !custom',
	})

	export const card = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		gap: '24',
		maxWidth: '600px !custom',
		width: '100% !custom',
	})

	export const heading = style({ textAlign: 'center' })

	export const title = style({
		color: 'content.primary',
		marginBottom: '8',
		typography: 'heading.h2',
	})

	export const description = style({
		color: 'content.secondary',
		typography: 'body.b2',
	})

	export const target = style({ typography: 'mono.inline' })

	export const units = style({
		display: 'grid',
		gap: '12',
		gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
		maxWidth: '400px !custom',
		width: '100% !custom',
	})

	export const blockLink = style({ fontVariantNumeric: 'tabular-nums' })

	export const remaining = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
	})

	export const dateLabel = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const dateIcon = style({
		color: 'content.tertiary',
		flexShrink: 0,
		height: '14px !custom',
		width: '14px !custom',
	})

	export const dateLabelLong = style({
		display: 'none',
		'@media (width >= 480px)': { display: 'inline' },
	})

	export const dateLabelShort = style({
		'@media (width >= 480px)': { display: 'none' },
	})

	export const unit = style({
		alignItems: 'center',
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		padding: '12',
	})

	export const unitValue = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		typography: 'heading.h1',
	})

	export const unitLabel = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})

	export const date = style({
		color: 'content.primary',
		whiteSpace: 'nowrap',
	})

	export const dateLong = style({
		display: 'none',
		'@media (width >= 620px)': { display: 'inline' },
	})

	export const dateShort = style({
		'@media (width >= 620px)': { display: 'none' },
	})
}
