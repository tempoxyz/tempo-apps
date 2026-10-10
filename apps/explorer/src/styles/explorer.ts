import { vars as core } from '@tempoxyz/ds/core'
import { style } from '@tempoxyz/ds/platform'
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
