import { vars } from '@tempoxyz/ds/platform'
import { global } from 'zyzz/web'

// Tempo Design System supplies the Pilat and JetBrains Mono faces through
// `@tempoxyz/ds/platform.css`. These rules set document defaults on top.
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
		'html[data-theme="dark"]': { colorScheme: 'dark' },
		body: {
			MozOsxFontSmoothing: 'grayscale',
			WebkitFontSmoothing: 'antialiased',
			fontFamily: 'Pilat, Arial, sans-serif',
			fontSize: '14px',
			fontWeight: 500,
			letterSpacing: '0.14px',
			lineHeight: '20px',
			minWidth: '320px',
		},
		'pre, code': { fontFamily: '"JetBrains Mono", monospace', fontWeight: 400 },
		'a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, summary:focus-visible':
			{
				borderRadius: '8px',
				outlineColor: vars.color.border.focus,
				outlineOffset: '2px',
				outlineStyle: 'solid',
				outlineWidth: '2px',
			},
		'input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button':
			{ appearance: 'none' },
		'input[type="number"]': { appearance: 'textfield' },
	},
	'@media (prefers-reduced-motion: reduce)': {
		'*, ::before, ::after': {
			animationDuration: '0.01ms',
			animationIterationCount: 1,
			scrollBehavior: 'auto',
			transitionDuration: '0.01ms',
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
		boxSizing: 'border-box',
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

// `usePermalinkHighlight` marks the linked element while it scrolls into view.
global({
	'[data-permalink-highlight]': {
		outlineColor: 'transparent',
		outlineOffset: '1px',
		outlineStyle: 'solid',
		outlineWidth: '1px',
		transition: 'outline-color 500ms',
	},
	'[data-permalink-highlight="on"]': {
		outlineColor: 'light-dark(rgb(68 113 237), rgb(116 152 251))',
	},
})
