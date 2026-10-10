/** biome-ignore-all lint/a11y/noNoninteractiveTabindex: native overflow region must be keyboard-scrollable */
import { style, vars } from '@tempoxyz/ds/platform'
import * as React from 'react'

/** Keep the active file's native horizontal scroll reachable below the viewport. */
export function ContractCodeScrollbar(props: {
	code: HTMLElement | null
	wrap: boolean
}): React.JSX.Element {
	const { code, wrap } = props
	const bar = React.useRef<HTMLElement>(null)
	const spacer = React.useRef<HTMLDivElement>(null)
	React.useEffect(() => {
		const track = bar.current
		const content = spacer.current
		if (!track || !content || !code || wrap) return

		function syncFromCode() {
			if (!track || !content || !code) return
			content.style.width = `${track.clientWidth + code.scrollWidth - code.clientWidth}px`
			track.scrollLeft = code.scrollLeft
		}
		function syncFromBar() {
			if (track && code && track.scrollLeft !== code.scrollLeft)
				code.scrollLeft = track.scrollLeft
		}
		const resize = new ResizeObserver(syncFromCode)
		resize.observe(code)
		resize.observe(track)
		// Virtualization and asynchronous highlighting replace the visible lines.
		const mutation = new MutationObserver(syncFromCode)
		mutation.observe(code, { childList: true, subtree: true })
		code.addEventListener('scroll', syncFromCode, { passive: true })
		track.addEventListener('scroll', syncFromBar, { passive: true })
		syncFromCode()
		return () => {
			resize.disconnect()
			mutation.disconnect()
			code.removeEventListener('scroll', syncFromCode)
			track.removeEventListener('scroll', syncFromBar)
		}
	}, [code, wrap])

	return (
		<section
			ref={bar}
			aria-label="Scroll source code horizontally"
			tabIndex={0}
			hidden={wrap}
			{...styles.track({ style: scrollbarColors })}
		>
			<div ref={spacer} {...styles.spacer()} />
		</section>
	)
}

const scrollbarColors = {
	scrollbarColor:
		'var(--contract-source-scrollbar-thumb) var(--contract-source-scrollbar-track)',
} satisfies React.CSSProperties

namespace styles {
	export const track = style({
		// zyzz types reject a color pair for `scrollbarColor`, so the element
		// applies it inline from these properties.
		'--contract-source-scrollbar-thumb': vars.color.content.tertiary,
		'--contract-source-scrollbar-track': vars.color.background.secondary,
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderTopWidth: 'regular',
		flexShrink: 0,
		height: '16',
		overflowX: 'scroll',
		overflowY: 'hidden',
		':focus-visible': {
			outlineColor: 'border.focus',
			outlineOffset: '-2px',
			outlineStyle: 'solid',
			outlineWidth: '2px',
		},
		'::-webkit-scrollbar': { height: '12px !custom' },
		'::-webkit-scrollbar-thumb': {
			backgroundColor: 'content.tertiary',
			borderColor: 'background.secondary',
			borderRadius: '6px !custom',
			borderStyle: 'solid',
			borderWidth: '3px !custom',
		},
	})

	export const spacer = style({ height: '1px !custom' })
}
