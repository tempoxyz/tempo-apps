import { vars as core } from '@tempoxyz/ds/core'
import { style, vars } from '@tempoxyz/ds/platform'
import { keyframes } from 'zyzz/web'

// Explorer additions on top of Tempo Design System Platform. TDS has no link
// or code colors, so links use the core blue pair and code uses violet.
// Combine with `cx(styles.x(), link())`.

export const link = style({
	color: `light-dark(${core.color.accent.blueLight}, ${core.color.accent.blueDark}) !custom`,
})

export const linkHover = style({
	'@media (hover: hover)': {
		':hover': { textDecorationLine: 'underline', textUnderlineOffset: '2px' },
	},
})

export const codeIdentifier = style({
	color: `light-dark(${core.color.accent.violetLight}, ${core.color.accent.violetDark}) !custom`,
})

export const pressDown = style({
	selectors: {
		'&:active:not([aria-disabled="true"])': { transform: 'translateY(0.5px)' },
	},
})

export const noScrollbar = style({
	scrollbarWidth: 'none',
	'::-webkit-scrollbar': { display: 'none' },
})

export const srOnly = style({
	borderWidth: '0 !custom',
	clipPath: 'inset(50%)',
	height: '1px !custom',
	margin: '-1px !custom',
	overflow: 'hidden',
	padding: 'none',
	position: 'absolute',
	whiteSpace: 'nowrap',
	width: '1px !custom',
})

export const transitionColors = style({
	transitionDuration: '150ms',
	transitionProperty:
		'color, background-color, border-color, outline-color, text-decoration-color, fill, stroke',
	transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
})

/** JetBrains Mono at the surrounding size, for hashes, addresses, and values. */
export const mono = style({
	fontFamily: '"JetBrains Mono", monospace',
	fontWeight: 400,
	letterSpacing: '0px !custom',
})

/**
 * TDS TextInput's field, for inputs that cannot use the component (it caps
 * its wrapper at 320px). Combine with a height override for compact rows.
 */
export const textField = style({
	backgroundColor: 'container.regular',
	border: 'none !custom',
	borderRadius: 'xs',
	color: 'content.primary',
	height: '48',
	paddingInline: '20',
	typography: 'body.b2',
	width: '100% !custom',
	'::placeholder': { color: 'content.secondary' },
	selectors: {
		'&:focus-visible': {
			outline: '2px solid currentColor !custom',
			outlineOffset: '2px !custom',
		},
		'&[aria-invalid="true"]': {
			boxShadow: `inset 0 0 0 1px ${core.color.accent.redLight} !custom`,
		},
	},
})

/** Data-visualisation fill: TDS core violet, outside the status colors. */
export const vizFill = style({
	backgroundColor: `light-dark(${core.color.accent.violetLight}, ${core.color.accent.violetDark}) !custom`,
})

export const truncate = style({
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
})

export const spin = keyframes({ to: { transform: 'rotate(360deg)' } })

export const ping = keyframes({
	'75%, 100%': { opacity: 0, transform: 'scale(2)' },
})

export const pulse = keyframes({ '50%': { opacity: 0.5 } })

export const rowShimmer = keyframes({
	from: { backgroundColor: vars.color.container.positive },
	to: { backgroundColor: 'transparent' },
})

/** Loading placeholder pulse. Off when the user prefers reduced motion. */
export const animatePulse = style({
	'@media (prefers-reduced-motion: no-preference)': {
		animation: `${pulse} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
	},
})

/** Live-status ping ring. Off when the user prefers reduced motion. */
export const animatePing = style({
	'@media (prefers-reduced-motion: no-preference)': {
		animation: `${ping} 1s cubic-bezier(0, 0, 0.2, 1) infinite`,
	},
})
