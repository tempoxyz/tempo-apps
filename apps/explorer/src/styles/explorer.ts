import { style, vars } from '@tempoxyz/ds'
import { keyframes } from 'zyzz/web'

// Explorer additions on top of Tempo Design System Web: link and code colors
// from the TDS ramps, and shared interaction recipes.
// Combine with `cx(styles.x(), link())`.

export const link = style({ color: 'blue.900' })

export const linkHover = style({
	'@media (hover: hover)': {
		':hover': { textDecorationLine: 'underline', textUnderlineOffset: '2px' },
	},
})

export const codeIdentifier = style({ color: 'purple.900' })

export const pressDown = style({
	selectors: {
		'&:active:not([aria-disabled="true"])': { transform: 'translateY(0.5px)' },
	},
})

/**
 * An unpadded text button with a trailing 12px icon, for actions that line up
 * with the text or card row around them, where the padding of a TDS text
 * `Button` would not. The global rule draws its focus ring.
 */
export const textAction = style({
	alignItems: 'center',
	backgroundColor: 'transparent !custom',
	border: 'none !custom',
	color: 'gray.900',
	columnGap: '4',
	cursor: 'pointer',
	display: 'inline-flex',
	padding: '0',
	typography: 'label.14.strong',
	whiteSpace: 'nowrap',
	selectors: {
		'& > svg': { flexShrink: '0 !custom', height: '12', width: '12' },
		'&:disabled': { cursor: 'default' },
	},
})

export const noScrollbar = style({
	scrollbarWidth: 'none',
	'::-webkit-scrollbar': { display: 'none' },
})

export const srOnly = style({
	borderWidth: '0px',
	clipPath: 'inset(50%)',
	height: '1',
	margin: '-1px !custom',
	overflow: 'hidden',
	padding: '0',
	position: 'absolute',
	whiteSpace: 'nowrap',
	width: '1',
})

/**
 * The page's inline margin from TDS Platform, which TDS Web dropped: 24px,
 * growing to 48, 64 and 80px at 768, 1024 and 1536px.
 */
export const pageMargin = style({
	paddingInline: '24',
	'@media (min-width: 768px)': { paddingInline: '48' },
	'@media (min-width: 1024px)': { paddingInline: '64' },
	'@media (min-width: 1536px)': { paddingInline: '80' },
})

export const transitionColors = style({
	transitionDuration: '150ms',
	transitionProperty:
		'color, background-color, border-color, outline-color, text-decoration-color, fill, stroke',
	transitionTimingFunction: 'in-out',
})

/**
 * The TDS mono face (Geist Mono) at the surrounding size, for hashes,
 * addresses, and values.
 */
export const mono = style({
	fontFamily: 'mono',
	fontWeight: 'normal',
	letterSpacing: 'normal',
})

/**
 * A text field in the TDS Input style, for inputs that show an invalid state.
 * Combine with a height override for compact rows.
 */
export const textField = style({
	backgroundColor: 'grayAlpha.100',
	border: 'none',
	borderRadius: '12',
	color: 'foreground',
	height: '48',
	paddingInline: '20',
	typography: 'copy.14',
	width: '100% !custom',
	'::placeholder': { color: 'gray.900' },
	selectors: {
		'&:focus-visible': {
			outline: `2px solid ${vars.color.blue[700]}`,
			outlineOffset: '2px',
		},
		'&[aria-invalid="true"]': {
			boxShadow: `inset 0 0 0 1px ${vars.color.red[900]} !custom`,
		},
	},
})

export const truncate = style({
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
})

export const rowShimmer = keyframes({
	from: { backgroundColor: vars.color.green[100] },
	to: { backgroundColor: 'transparent' },
})

/** Loading placeholder pulse. Off when the user prefers reduced motion. */
export const animatePulse = style({
	'@media (prefers-reduced-motion: no-preference)': {
		animation: 'pulse',
	},
})

/** Live-status ping ring. Off when the user prefers reduced motion. */
export const animatePing = style({
	'@media (prefers-reduced-motion: no-preference)': {
		animation: 'ping',
	},
})
