import { vars } from '@tempoxyz/ds'
import { global } from 'zyzz/web'

// Tempo Design System emits its variables, the Inter and Geist Mono faces,
// and body font smoothing. These rules set the remaining document defaults.
global({
	'@layer base': {
		'html, :host': {
			backgroundColor: vars.color.background.primary,
			color: vars.color.foreground,
			colorScheme: 'dark',
			fontFamily: vars.fontFamily.sans,
			scrollbarGutter: 'stable',
		},
		':root': { touchAction: 'manipulation' },
		'html[data-theme="light"]': { colorScheme: 'light' },
		'pre, code': { fontFamily: vars.fontFamily.mono, fontWeight: 400 },
		// TDS controls draw their own ring; the explorer's links match it.
		'a:focus-visible, button:focus-visible': {
			outlineColor: vars.color.blue[700],
			outlineOffset: '2px',
			outlineStyle: 'solid',
			outlineWidth: '2px',
		},
	},
	// iOS Safari zooms into a focused field whose text is under 16px. `:root`
	// outranks the single class that sets a TDS control's type.
	'@supports (-webkit-touch-callout: none)': {
		':root :is(input, select, textarea)': { fontSize: '16px' },
	},
	// Component styles are unlayered classes, so the preference needs
	// importance to win over their animations and transitions.
	'@media (prefers-reduced-motion: reduce)': {
		'*, ::before, ::after': {
			animationDuration: '0.01ms !important',
			animationIterationCount: '1 !important',
			scrollBehavior: 'auto !important',
			transitionDuration: '0.01ms !important',
		},
	},
})

// TDS sets the body to its 15px `copy.15` in gray, unlayered. The explorer's
// data is denser and reads in the foreground color, so this rule outranks it:
// 14px Inter at TDS's copy weight.
global({
	'html body': {
		color: vars.color.foreground,
		fontSize: '14px',
		fontWeight: 450,
		lineHeight: '20px',
		minWidth: '320px',
	},
})

// Shiki renders highlighted source as markup, so its blocks are styled by
// class. Its inline backgrounds need !important, which only takes literals.
global({
	'.shiki-block, .shiki-block.shiki': {
		backgroundColor: vars.color.background.surface,
		fontFamily: vars.fontFamily.mono,
		fontSize: '12px',
		fontWeight: 400,
		letterSpacing: '0',
		lineHeight: '18px',
		margin: '0',
		marginBottom: '8px',
		maxHeight: '320px',
		overflow: 'auto',
		paddingInline: '16px !important',
	},
	'.shiki-block code': {
		backgroundColor: 'transparent !important',
		fontFamily: 'inherit',
	},
	'pre .shiki, .shiki pre': { backgroundColor: 'transparent !important' },
})

// `usePermalinkHighlight` marks the linked element while it scrolls into view,
// then fades the ring out.
global({
	'[data-permalink-highlight]': {
		outlineOffset: '1px',
		outlineStyle: 'solid',
		outlineWidth: '1px',
	},
	'[data-permalink-highlight="on"]': { outlineColor: vars.color.blue[900] },
	'[data-permalink-highlight="fading"]': {
		outlineColor: 'transparent',
		transition: 'outline-color 500ms',
	},
})
