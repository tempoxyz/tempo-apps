import { vars as core } from '@tempoxyz/ds/core'
import { vars } from '@tempoxyz/ds/platform'
import { global } from 'zyzz/web'

// Tempo Design System supplies the Pilat and JetBrains Mono faces and body
// font smoothing through `@tempoxyz/ds/platform.css`. These rules set the
// remaining document defaults.
global({
	'@layer base': {
		'html, :host': {
			backgroundColor: vars.color.background.primary,
			color: vars.color.content.primary,
			colorScheme: 'dark',
			fontFamily: 'Pilat, Arial, sans-serif',
			scrollbarGutter: 'stable',
		},
		':root': { touchAction: 'manipulation' },
		'html[data-theme="light"]': { colorScheme: 'light' },
		body: {
			fontSize: '14px',
			fontWeight: 500,
			letterSpacing: '0.14px',
			lineHeight: '20px',
			minWidth: '320px',
		},
		'pre, code': { fontFamily: '"JetBrains Mono", monospace', fontWeight: 400 },
		// Matches the focus ring TDS components draw.
		'a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, summary:focus-visible':
			{
				outlineColor: 'currentColor',
				outlineOffset: '2px',
				outlineStyle: 'solid',
				outlineWidth: '2px',
			},
		'input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button':
			{ appearance: 'none' },
		'input[type="number"]': { appearance: 'textfield' },
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

// `midcut` renders these class names itself.
global({
	'.midcut': {
		display: 'inline-grid',
		gridTemplateAreas: '"content"',
		gridTemplateColumns: 'minmax(0, 1fr)',
		maxWidth: '100%',
		minWidth: '0',
		overflow: 'hidden',
		textDecoration: 'inherit',
		verticalAlign: 'bottom',
		whiteSpace: 'nowrap',
		width: '100%',
	},
	'.midcut__findable, .midcut__visual': {
		gridArea: 'content',
		justifySelf: 'stretch',
		maxWidth: '100%',
		minWidth: '0',
		overflow: 'hidden',
		textDecoration: 'inherit',
		whiteSpace: 'nowrap',
	},
	'.midcut__findable': { color: 'inherit' },
	'.midcut[data-align="end"] .midcut__findable': { textAlign: 'end' },
	'.midcut[data-cut="true"] .midcut__findable': {
		// Hide inherited underlines along with the searchable full value.
		clipPath: 'inset(50%)',
		color: 'transparent',
		textAlign: 'start',
	},
	'.midcut__visual': { display: 'none', pointerEvents: 'none' },
	'.midcut[data-cut="true"] .midcut__visual': {
		color: 'inherit',
		display: 'block',
	},
	'.midcut[data-align="end"] .midcut__visual': { textAlign: 'end' },
	'.midcut__visual::before': { content: 'attr(data-text)' },
})

// Shiki renders highlighted source as markup, so its blocks are styled by
// class. Its inline backgrounds need !important, which only takes literals.
global({
	'.shiki-block, .shiki-block.shiki': {
		backgroundColor: vars.color.background.secondary,
		fontFamily: '"JetBrains Mono", monospace',
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
		outlineColor: `light-dark(${core.color.accent.blueLight}, ${core.color.accent.blueDark})`,
	},
	'[data-permalink-highlight="fading"]': {
		outlineColor: 'transparent',
		transition: 'outline-color 500ms',
	},
})
