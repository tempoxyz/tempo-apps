import { style, vars } from '@tempoxyz/ds'
import { keyframes } from 'zyzz/web'

// Explorer additions TDS lacks: link and code colors from the TDS ramps, and
// small text recipes. Combine with `cx(styles.x(), link())`.

export const link = style({ color: 'blue.900' })

export const linkHover = style({
	'@media (hover: hover)': {
		':hover': { textDecorationLine: 'underline', textUnderlineOffset: '2px' },
	},
})

export const codeIdentifier = style({ color: 'purple.900' })

export const noScrollbar = style({
	scrollbarWidth: 'none',
	'::-webkit-scrollbar': { display: 'none' },
})

export const srOnly = style({
	borderWidth: '0 !custom',
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
 * The TDS mono face (Geist Mono) at the surrounding size, for hashes,
 * addresses, and values.
 */
export const mono = style({
	fontFamily: 'mono',
	fontWeight: 'normal',
	letterSpacing: 'normal',
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
