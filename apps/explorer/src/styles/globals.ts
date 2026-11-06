import { vars } from '@tempoxyz/ds'
import { global } from 'zyzz/web'

// Tempo Design System emits its variables, the Inter, Pilat and JetBrains Mono
// faces, and body font smoothing. These rules set the remaining document defaults.
global({
	'@layer base': {
		'html, :host': {
			backgroundColor: vars.color.background.primary,
			color: vars.color.content.primary,
			colorScheme: 'dark',
			fontFamily: vars.fontFamily.body,
			scrollbarGutter: 'stable',
		},
		':root': { touchAction: 'manipulation' },
		'html[data-theme="light"]': { colorScheme: 'light' },
		'pre, code': { fontFamily: vars.fontFamily.mono, fontWeight: 400 },
		// TDS controls draw their own ring; the explorer's links match it.
		'a:focus-visible, button:focus-visible': {
			outlineColor: vars.color.border.focus,
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

// TDS sets the body to `body.b1` in the secondary color, unlayered. The
// explorer's data is denser and reads in the primary color, so this rule
// outranks it with `body.b2`, the size TDS takes "a size down on dense screens".
global({
	'html body': {
		color: vars.color.content.primary,
		fontSize: vars.typography.body.b2.fontSize,
		fontWeight: vars.typography.body.b2.fontWeight,
		letterSpacing: vars.typography.body.b2.letterSpacing,
		lineHeight: vars.typography.body.b2.lineHeight,
		minWidth: '320px',
	},
})

// Shiki renders highlighted source as markup, so its blocks are styled by
// class. Its inline backgrounds need !important, which only takes literals.
global({
	'.shiki-block, .shiki-block.shiki': {
		backgroundColor: vars.color.background.elevated,
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
	'[data-permalink-highlight="on"]': {
		outlineColor: vars.color.content.accent,
	},
	'[data-permalink-highlight="fading"]': {
		outlineColor: 'transparent',
		transition: 'outline-color 500ms',
	},
})
