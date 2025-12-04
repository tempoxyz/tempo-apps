import type { Hex } from 'ox'
import * as React from 'react'

/**
 * Displays a hex hash that truncates in the middle when space is limited.
 * Dynamically adjusts based on available container width.
 */
export function TruncatedHash(props: TruncatedHash.Props) {
	const { hash, minChars = 16, className } = props

	const containerRef = React.useRef<HTMLSpanElement>(null)
	const measureRef = React.useRef<HTMLSpanElement>(null)
	const textRef = React.useRef<HTMLSpanElement>(null)

	// Use layout effect to measure and update before browser paint
	React.useLayoutEffect(() => {
		const container = containerRef.current
		const measure = measureRef.current
		const text = textRef.current
		if (!container || !measure || !text) return

		const calculateDisplay = () => {
			const containerWidth = container.offsetWidth

			// Measure the width of the full hash
			measure.textContent = hash
			const fullWidth = measure.offsetWidth

			if (fullWidth <= containerWidth) {
				// Full hash fits
				text.textContent = hash
				return
			}

			// Measure width of ellipsis
			measure.textContent = '…'
			const ellipsisWidth = measure.offsetWidth

			// Available width for hash characters
			const availableWidth = containerWidth - ellipsisWidth

			// Measure width of a single character (use '0' as reference for monospace)
			measure.textContent = '0'
			const charWidth = measure.offsetWidth

			// Calculate how many total chars we can fit
			const maxChars = Math.floor(availableWidth / charWidth)

			// Split evenly between start and end, but ensure minimum
			const prefixLength = 2 // "0x"
			const charsPerSide = Math.max(
				minChars,
				Math.floor((maxChars - prefixLength) / 2),
			)

			text.textContent = truncateHash(hash, charsPerSide)
		}

		// Initial calculation
		calculateDisplay()

		// Watch for resize with debounce to reduce flicker
		let rafId: number | null = null
		const resizeObserver = new ResizeObserver(() => {
			if (rafId) cancelAnimationFrame(rafId)
			rafId = requestAnimationFrame(calculateDisplay)
		})
		resizeObserver.observe(container)

		return () => {
			if (rafId) cancelAnimationFrame(rafId)
			resizeObserver.disconnect()
		}
	}, [hash, minChars])

	return (
		<span
			ref={containerRef}
			className={className}
			style={{
				display: 'block',
				overflow: 'hidden',
				whiteSpace: 'nowrap',
			}}
		>
			{/* Hidden span for measuring text width */}
			<span
				ref={measureRef}
				aria-hidden
				style={{
					position: 'absolute',
					visibility: 'hidden',
					whiteSpace: 'nowrap',
					pointerEvents: 'none',
				}}
			/>
			{/* Text span that gets updated directly via ref to avoid re-renders */}
			<span ref={textRef}>{truncateHash(hash, minChars)}</span>
		</span>
	)
}

declare namespace TruncatedHash {
	export interface Props {
		hash: Hex.Hex
		minChars?: number
		className?: string
	}
}

function truncateHash(hash: Hex.Hex, charsPerSide: number) {
	const prefixLength = 2 // "0x"
	const hashBody = hash.slice(prefixLength)

	if (charsPerSide * 2 >= hashBody.length) return hash

	const start = hash.slice(0, prefixLength + charsPerSide)
	const end = hash.slice(-charsPerSide)
	return `${start}…${end}`
}
