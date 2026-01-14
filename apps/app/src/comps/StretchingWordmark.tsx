import * as React from 'react'

const ANIMATION_DURATION = 20000 // 20 seconds for slow loop
const ROW_HEIGHT = 24
const ROW_GAP = 15

// Pre-computed stretch factors for 15 rows creating the diagonal wave pattern
const STRETCH_PATTERN = [
	1,
	1.2,
	1.8,
	2.5,
	3.2,
	4.0,
	5.0,
	5.5, // peak stretch
	5.0,
	4.0,
	3.2,
	2.5,
	1.8,
	1.2,
	1,
]

// TEMPO path extracted from reference SVG - italic letterforms
// Original bounds: x ~2.31 to ~228.79, y ~548.75 to ~567
// Normalized to start at origin
const TEMPO_PATH = `
M20.22 18.25H15.23L19.88 4.01H0L1.27 0H45.69L44.42 4.01H24.84L20.22 18.25Z
M81.94 18.25H41.53L47.47 0H87.83L86.66 3.7H51.26L50.05 7.27H85.32L84.15 10.97H48.93L47.71 14.55H83.18L81.94 18.25Z
M88.38 18.25H83.9L89.84 0H95.53L108.13 13.67L130.08 0H136.99L131.05 18.25H126.09L130.42 4.72L108.82 18.25H105.63L92.9 4.38L88.38 18.25Z
M142.99 3.7L141.24 9H169.46C170.79 9 171.9 8.78 172.79 8.35C173.7 7.91 174.26 7.18 174.47 6.16C174.63 5.35 174.49 4.74 174.06 4.33C173.63 3.91 172.94 3.7 171.97 3.7H142.99ZM138.27 18.25H133.31L139.24 0H173.57C174.93 0 176.09 0.25 177.05 0.75C178.02 1.26 178.72 1.95 179.14 2.85C179.58 3.72 179.72 4.71 179.56 5.82C179.35 7.26 178.83 8.5 178 9.54C177.17 10.56 176.08 11.35 174.71 11.9C173.37 12.43 171.79 12.7 170 12.7H140.07L138.27 18.25Z
M220.23 16.86C218.59 17.78 216.84 18.25 214.98 18.25H186.58C184.91 18.25 183.52 17.9 182.4 17.22C181.3 16.53 180.51 15.57 180.04 14.35C179.59 13.14 179.48 11.77 179.73 10.27C180.02 8.47 180.71 6.78 181.79 5.21C182.9 3.63 184.27 2.38 185.9 1.44C187.56 0.48 189.33 0 191.21 0H219.62C221.34 0 222.76 0.35 223.88 1.05C225 1.73 225.78 2.68 226.22 3.89C226.65 5.11 226.74 6.49 226.48 8.03C226.18 9.85 225.47 11.54 224.37 13.11C223.26 14.67 221.89 15.92 220.23 16.86ZM185.22 13.62C185.81 14.24 186.73 14.55 188 14.55H214.44C215.41 14.55 216.4 14.26 217.41 13.67C218.41 13.09 219.29 12.27 220.04 11.22C220.78 10.15 221.28 8.93 221.52 7.57C221.75 6.24 221.6 5.26 221.08 4.65C220.56 4.01 219.73 3.7 218.58 3.7H191.55C190.53 3.7 189.54 3.99 188.58 4.57C187.62 5.16 186.8 5.98 186.1 7.05C185.42 8.11 184.95 9.32 184.69 10.68C184.46 12.01 184.64 12.99 185.22 13.62Z
`

const TEMPO_WIDTH = 227
const TEMPO_HEIGHT = 18.25

export function StretchingWordmark({ className }: { className?: string }) {
	const containerRef = React.useRef<HTMLDivElement>(null)
	const [time, setTime] = React.useState(0)
	const [dimensions, setDimensions] = React.useState({
		width: 800,
		height: 1200,
	})

	React.useEffect(() => {
		const updateDimensions = () => {
			if (containerRef.current) {
				setDimensions({
					width: containerRef.current.clientWidth,
					height: containerRef.current.clientHeight,
				})
			}
		}
		updateDimensions()
		window.addEventListener('resize', updateDimensions)
		return () => window.removeEventListener('resize', updateDimensions)
	}, [])

	React.useEffect(() => {
		let animationId: number
		let startTime: number | null = null

		const animate = (timestamp: number) => {
			if (!startTime) startTime = timestamp
			const elapsed = timestamp - startTime
			setTime((elapsed % ANIMATION_DURATION) / ANIMATION_DURATION)
			animationId = requestAnimationFrame(animate)
		}

		animationId = requestAnimationFrame(animate)
		return () => cancelAnimationFrame(animationId)
	}, [])

	const baseScale = ROW_HEIGHT / TEMPO_HEIGHT
	const baseWidth = TEMPO_WIDTH * baseScale
	const rowCount = Math.ceil(dimensions.height / (ROW_HEIGHT + ROW_GAP)) + 2
	const patternLength = STRETCH_PATTERN.length

	return (
		<div
			ref={containerRef}
			className={className}
			style={{ overflow: 'hidden', position: 'absolute', inset: 0 }}
		>
			<svg
				aria-hidden="true"
				width="100%"
				height="100%"
				style={{ position: 'absolute', inset: 0 }}
			>
				{Array.from({ length: rowCount }).map((_, rowIndex) => {
					const y = rowIndex * (ROW_HEIGHT + ROW_GAP)

					// Animate the pattern offset over time
					const patternOffset = time * patternLength
					const effectiveIndex = (rowIndex + patternOffset) % patternLength
					const lowerIndex = Math.floor(effectiveIndex)
					const upperIndex = (lowerIndex + 1) % patternLength
					const fraction = effectiveIndex - lowerIndex

					// Interpolate between stretch values for smooth animation
					const stretchA = STRETCH_PATTERN[lowerIndex]
					const stretchB = STRETCH_PATTERN[upperIndex]
					const scaleX = stretchA + (stretchB - stretchA) * fraction

					// Calculate stretched width
					const stretchedWidth = baseWidth * scaleX

					// Position: center the stretched wordmark
					const xOffset = (dimensions.width - stretchedWidth) / 2

					return (
						<g
							key={rowIndex}
							transform={`translate(${xOffset}, ${y}) scale(${baseScale * scaleX}, ${baseScale})`}
						>
							<path
								d={TEMPO_PATH}
								fill="none"
								stroke="currentColor"
								strokeWidth={0.6 / baseScale / Math.sqrt(scaleX)}
								opacity={0.2}
							/>
						</g>
					)
				})}
			</svg>
		</div>
	)
}
