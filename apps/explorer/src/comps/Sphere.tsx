import { style } from '@tempoxyz/ds/platform'
import { useEffect, useRef, useState } from 'react'
import letters from '#lib/tempo-globe.json' with { type: 'json' }

const TAU = Math.PI * 2
const RINGS = 7
const DURATION = 1800
const STAGGER = 110

export function Sphere(): React.JSX.Element {
	const [turn, setTurn] = useState(0)
	const canvasRef = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		const canvas = canvasRef.current
		const context = canvas?.getContext('2d')
		if (!canvas || !context) return
		const motion = matchMedia('(prefers-reduced-motion: reduce)')
		const visible = matchMedia('(min-width: 640px) and (min-height: 761px)')
		let frame = 0
		const start = performance.now()
		const scale = Math.min(devicePixelRatio || 1, 2)
		canvas.width = 656 * scale
		canvas.height = 285 * scale
		context.scale(scale, scale)

		function draw(now: number) {
			if (!context || !canvas || !visible.matches || document.hidden) return
			const elapsed = motion.matches ? Infinity : now - start
			const light = document.documentElement.dataset.theme === 'light'
			context.clearRect(0, 0, 656, 285)
			const gradient = context.createLinearGradient(0, 0, 656, 0)
			gradient.addColorStop(0, light ? '#18181808' : '#ffffff08')
			gradient.addColorStop(0.55, light ? '#18181830' : '#ffffff60')
			gradient.addColorStop(1, light ? '#18181860' : '#ffffff12')
			context.fillStyle = gradient
			context.strokeStyle = gradient
			context.lineWidth = 0.3
			for (let ring = 0; ring < RINGS; ring++) {
				const progress = Math.max(
					0,
					Math.min(1, (elapsed - ring * STAGGER) / DURATION),
				)
				const eased = 1 - (1 - progress) ** 4
				// Settle on the E/M letter boundary, staggered leftward like the original globe.
				const restingAngle = -TAU * 0.395 - ring * 0.055
				const angle = -TAU * (1 - eased) + restingAngle
				const radiusY = 318 - ring * 34
				context.globalAlpha = turn === 0 ? Math.min(1, progress * 5) : 1
				for (const letter of letters) {
					context.beginPath()
					for (const contour of letter) {
						contour.forEach(([u, v], index) => {
							const theta = u * TAU + angle
							// Offset glyph height along the ellipse's outward normal.
							// Opposing X/Y radius changes pinch and fold the contours at the sides.
							const sin = Math.sin(theta)
							const cos = Math.cos(theta)
							const normalLength = Math.hypot(radiusY * sin, 328 * cos)
							// Keep the lettering shallow: tall M diagonals bend the apparent ring.
							const height = v * 4
							const x =
								328 + 328 * sin + (height * radiusY * sin) / normalLength
							const y =
								330 - radiusY * cos - (height * 328 * cos) / normalLength
							if (index === 0) context.moveTo(x, y)
							else context.lineTo(x, y)
						})
						context.closePath()
					}
					context.fill()
					context.stroke()
				}
			}
			if (elapsed < DURATION + (RINGS - 1) * STAGGER)
				frame = requestAnimationFrame(draw)
		}
		function refresh() {
			cancelAnimationFrame(frame)
			draw(performance.now())
		}
		const theme = new MutationObserver(refresh)
		theme.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme'],
		})
		motion.addEventListener('change', refresh)
		visible.addEventListener('change', refresh)
		document.addEventListener('visibilitychange', refresh)
		frame = requestAnimationFrame(draw)
		return () => {
			cancelAnimationFrame(frame)
			theme.disconnect()
			motion.removeEventListener('change', refresh)
			visible.removeEventListener('change', refresh)
			document.removeEventListener('visibilitychange', refresh)
		}
	}, [turn])

	return (
		<div {...styles.root()}>
			<div {...styles.stage()}>
				<button
					type="button"
					aria-label="Rotate Tempo globe rings"
					onClick={() => setTurn((value) => value + 1)}
					{...styles.button()}
				>
					<canvas ref={canvasRef} {...styles.canvas()} />
				</button>
			</div>
		</div>
	)
}

namespace styles {
	export const root = style({
		bottom: '0px !custom',
		display: 'none',
		height: '194px !custom',
		overflow: 'hidden',
		pointerEvents: 'none',
		position: 'fixed',
		width: '100% !custom',
		zIndex: 0,
		'@media (width >= 640px)': { display: 'block' },
		'@media print': { display: 'none' },
		'@media (height <= 760px)': { display: 'none' },
	})

	export const stage = style({
		display: 'flex',
		justifyContent: 'center',
		position: 'absolute',
		top: '0px !custom',
		width: '100% !custom',
	})

	// The root clips overflow, so the document focus ring is drawn inside.
	export const button = style({
		aspectRatio: '656 / 285',
		borderRadius: 'xs',
		cursor: 'pointer',
		maxWidth: '120vw !custom',
		pointerEvents: 'auto',
		width: '656px !custom',
		':focus-visible': { outlineOffset: '-4px' },
	})

	export const canvas = style({
		display: 'block',
		height: '100% !custom',
		width: '100% !custom',
	})
}
