import { style } from '@tempoxyz/ds/platform'

// Route components are code-split into modules that zyzz does not compile,
// so the route's styles live here.

export namespace styles {
	export const page = style({
		display: 'flex',
		flexDirection: 'column',
		paddingBottom: '48',
		paddingInline: 'page.margin',
		paddingTop: '32',
		typography: 'body.b2',
		width: '100% !custom',
		'@media (width >= 800px)': { paddingTop: '48' },
	})

	export const toolbar = style({
		alignItems: 'center',
		columnGap: '16',
		display: 'flex',
		flexWrap: 'wrap',
		marginBottom: '12',
		rowGap: '8',
	})

	export const title = style({
		color: 'content.primary',
		flexShrink: 0,
		margin: 'none',
		typography: 'heading.h3',
	})

	export const summary = style({
		color: 'content.tertiary',
		flex: 1,
		fontVariantNumeric: 'tabular-nums',
		margin: 'none',
		minWidth: '0 !custom',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		typography: 'body.b2',
		whiteSpace: 'nowrap',
	})

	export const shortcut = style({ opacity: 0.7, typography: 'body.b3' })

	export const panes = style({
		alignItems: 'start',
		display: 'grid',
		gap: '16',
		minHeight: '560px !custom',
		minWidth: '0 !custom',
	})

	export const panesSplit = style({
		'@media (width >= 1100px)': {
			gridTemplateColumns: 'minmax(360px, 420px) minmax(0, 1fr)',
		},
	})

	export const card = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		minWidth: '0 !custom',
		overflow: 'hidden',
	})

	export const evidence = style({
		display: 'flex',
		flexDirection: 'column',
		minWidth: '0 !custom',
		transitionDuration: '150ms',
		transitionProperty: 'opacity',
		transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
	})

	export const stale = style({ opacity: 0.6 })

	export const panel = style({ minWidth: '0 !custom' })

	export const column = style({ display: 'flex', flexDirection: 'column' })

	export const stack = style({
		display: 'flex',
		flexDirection: 'column',
		minWidth: '0 !custom',
	})

	export const emptyHeader = style({
		alignItems: 'center',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		display: 'flex',
		gap: '8',
		paddingBlock: '12',
		paddingInline: '16',
	})

	export const emptyTitle = style({
		color: 'content.tertiary',
		typography: 'body.b2',
	})

	export const emptyPreview = style({
		opacity: 0.4,
		pointerEvents: 'none',
		userSelect: 'none',
	})

	export const emptyBody = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		padding: '16',
	})

	export const emptyText = style({
		color: 'content.tertiary',
		margin: 'none',
		maxWidth: '520px !custom',
		typography: 'body.b2',
	})

	export const emptyActions = style({
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
	})
}
