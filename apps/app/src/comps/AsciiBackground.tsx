import { waapi } from 'animejs'
import * as React from 'react'

type Line = {
	id: number
	x1: number
	y1: number
	x2: number
	y2: number
	opacity: number
}

function generateLine(id: number, width: number, height: number): Line {
	// Create angular lines - mostly diagonal, varying lengths
	const startX = Math.random() * width
	const startY = Math.random() * height

	// Angle preference: diagonal lines (45° variations)
	const angle =
		(Math.random() * 60 - 30 + (Math.random() > 0.5 ? 45 : -45)) *
		(Math.PI / 180)
	const length = 50 + Math.random() * 150

	return {
		id,
		x1: startX,
		y1: startY,
		x2: startX + Math.cos(angle) * length,
		y2: startY + Math.sin(angle) * length,
		opacity: 0.03 + Math.random() * 0.06,
	}
}

export function AsciiBackground() {
	const containerRef = React.useRef<HTMLDivElement>(null)
	const svgRef = React.useRef<SVGSVGElement>(null)
	const [lines, setLines] = React.useState<Line[]>([])
	const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 })

	// Initialize lines
	React.useEffect(() => {
		const container = containerRef.current
		if (!container) return

		const updateDimensions = () => {
			const width = container.clientWidth
			const height = container.clientHeight
			setDimensions({ width, height })

			const lineCount = Math.floor((width * height) / 8000)
			const newLines: Line[] = []
			for (let i = 0; i < lineCount; i++) {
				newLines.push(generateLine(i, width, height))
			}
			setLines(newLines)
		}

		updateDimensions()
		const resizeObserver = new ResizeObserver(updateDimensions)
		resizeObserver.observe(container)

		return () => resizeObserver.disconnect()
	}, [])

	// Animate lines
	React.useEffect(() => {
		if (!svgRef.current || lines.length === 0) return

		const lineElements = svgRef.current.querySelectorAll('line')

		// Animate each line with staggered timing
		lineElements.forEach((line, i) => {
			const delay = i * 50

			// Subtle position drift
			waapi.animate(line, {
				x1: [lines[i].x1, lines[i].x1 + (Math.random() - 0.5) * 30],
				y1: [lines[i].y1, lines[i].y1 + (Math.random() - 0.5) * 30],
				x2: [lines[i].x2, lines[i].x2 + (Math.random() - 0.5) * 30],
				y2: [lines[i].y2, lines[i].y2 + (Math.random() - 0.5) * 30],
				opacity: [lines[i].opacity, lines[i].opacity * 0.5, lines[i].opacity],
				duration: 4000 + Math.random() * 3000,
				delay,
				loop: true,
				alternate: true,
				ease: 'inOutSine',
			})
		})
	}, [lines])

	return (
		<div
			ref={containerRef}
			className="absolute inset-0 overflow-hidden pointer-events-none select-none"
			aria-hidden="true"
		>
			<svg
				ref={svgRef}
				width={dimensions.width}
				height={dimensions.height}
				className="absolute inset-0"
				aria-hidden="true"
			>
				<title>Background decoration</title>
				{lines.map((line) => (
					<line
						key={line.id}
						x1={line.x1}
						y1={line.y1}
						x2={line.x2}
						y2={line.y2}
						stroke="currentColor"
						strokeWidth="1"
						className="text-primary"
						style={{ opacity: line.opacity }}
					/>
				))}
			</svg>
		</div>
	)
}
