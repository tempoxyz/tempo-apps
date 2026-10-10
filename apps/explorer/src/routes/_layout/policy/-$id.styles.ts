import { style, variants } from '@tempoxyz/ds/platform'

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

	export const tertiary = style({ color: 'content.tertiary' })

	export const typeBadge = variants({
		base: {
			borderRadius: '3xs',
			paddingBlock: '2',
			paddingInline: '8',
			textTransform: 'capitalize',
			typography: 'body.b3',
		},
		defaultVariants: { tone: 'neutral' },
		variants: {
			tone: {
				negative: {
					backgroundColor: 'container.negative',
					color: 'content.negative',
				},
				neutral: {
					backgroundColor: 'container.regular',
					color: 'content.primary',
				},
				positive: {
					backgroundColor: 'container.positive',
					color: 'content.positive',
				},
			},
		},
	})

	export const search = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	// Mirrors TDS TextInput (filled) at the small button height.
	export const searchInput = style({
		backgroundColor: 'component.input.primary.fill',
		borderColor: 'transparent !custom',
		borderRadius: '2xs',
		borderWidth: 'regular',
		color: 'content.primary',
		height: '32',
		paddingInline: '12',
		typography: 'mono.inline',
		width: '220px !custom',
		'::placeholder': { color: 'content.tertiary' },
		':focus': { borderColor: 'border.focus' },
	})

	export const status = variants({
		variants: {
			tone: {
				negative: { color: 'content.negative' },
				positive: { color: 'content.positive' },
			},
		},
	})

	export const event = style({ color: 'content.primary' })

	export const transaction = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
	})
}
