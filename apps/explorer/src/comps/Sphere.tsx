import { waapi } from 'animejs'
import { useEffect, useRef } from 'react'
import { springLazy } from '#lib/animation'
import { useTheme } from '#lib/theme'

export function Sphere(props: Sphere.Props) {
	const { animate } = props
	const containerRef = useRef<HTMLDivElement>(null)
	const rotatorRef = useRef<HTMLDivElement>(null)
	const animateOnMount = useRef(animate)

	useEffect(() => {
		if (!containerRef.current || !animateOnMount.current) return
		const anim = waapi.animate(containerRef.current, {
			opacity: [0, 1],
			scale: [0.7, 1],
			ease: springLazy,
			delay: 300,
		})
		return () => {
			try {
				anim.cancel()
			} catch {}
		}
	}, [])

	// Looping parallax: as the user scrolls, the orb translates upward at a
	// fraction of scroll speed and wraps modulo `wrap` so once it has fully
	// exited the top of the viewport it re-enters from the bottom. The
	// rotation is layered on top in the same transform to avoid a second
	// composited layer.
	useEffect(() => {
		const node = rotatorRef.current
		if (!node) return

		const SCROLL_SPEED = 0.6
		const DEGREES_PER_PIXEL = 0.05

		let frame: number | null = null
		let wrap = window.innerHeight + node.offsetHeight
		let lastY = -1

		const apply = () => {
			frame = null
			const y = window.scrollY || 0
			if (y === lastY) return
			lastY = y
			const traveled = y * SCROLL_SPEED
			// Start the orb cropped at the top: initial offset = 0 means the
			// element sits at its natural `top: 0` position, then the modulo
			// belt scrolls it upward and re-enters from the bottom.
			const offset = -((traveled % wrap) | 0)
			const angle = traveled * DEGREES_PER_PIXEL
			node.style.transform = `translate3d(0, ${offset}px, 0) rotate(${angle.toFixed(2)}deg)`
		}

		const onScroll = () => {
			if (frame != null) return
			frame = window.requestAnimationFrame(apply)
		}

		const onResize = () => {
			wrap = window.innerHeight + node.offsetHeight
			apply()
		}

		apply()
		window.addEventListener('scroll', onScroll, { passive: true })
		window.addEventListener('resize', onResize)
		return () => {
			if (frame != null) window.cancelAnimationFrame(frame)
			window.removeEventListener('scroll', onScroll)
			window.removeEventListener('resize', onResize)
		}
	}, [])

	return (
		<div className="fixed inset-0 w-full pointer-events-none overflow-hidden z-0 print:hidden hidden sm:block opacity-[0.13]">
			<div
				ref={containerRef}
				className="absolute top-0 z-0 w-full flex justify-center pointer-events-none"
				style={{ opacity: animateOnMount.current ? 0 : 1 }}
			>
				<div
					ref={rotatorRef}
					className="transform-gpu will-change-transform"
					style={{ transform: 'translate3d(0,0,0) rotate(0deg)' }}
				>
					<Sphere.Artwork />
				</div>
			</div>
		</div>
	)
}

export namespace Sphere {
	export interface Props {
		animate?: boolean
	}

	export function Artwork(): React.JSX.Element {
		const { resolved } = useTheme()
		const src =
			resolved === 'light' ? '/landing-orb-light.svg' : '/landing-orb-dark.svg'

		return (
			<img
				src={src}
				alt=""
				aria-hidden="true"
				decoding="async"
				loading="lazy"
				width={1066}
				height={926}
				className="w-[820px] max-w-[140vw] h-auto"
				draggable={false}
			/>
		)
	}
}
