/** biome-ignore-all lint/a11y/noNoninteractiveTabindex: native overflow region must be keyboard-scrollable */
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
			className="source-scrollbar h-4 shrink-0 overflow-x-scroll overflow-y-hidden border-t border-card-border bg-source-background focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-[-2px]"
		>
			<div ref={spacer} className="h-px" />
		</section>
	)
}
