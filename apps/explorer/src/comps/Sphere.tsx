import { waapi } from 'animejs'
import { useEffect, useRef } from 'react'
import { springLazy } from '#lib/animation'
import { useTheme } from '#lib/theme'

export function Sphere(props: Sphere.Props) {
	const { animate } = props
	const containerRef = useRef<HTMLDivElement>(null)
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

	return (
		<div className="fixed bottom-0 w-full pointer-events-none overflow-hidden h-[300px] z-0 print:hidden hidden sm:block opacity-20">
			<div
				ref={containerRef}
				className="absolute top-0 z-0 w-full flex justify-center pointer-events-none"
				style={{ opacity: animateOnMount.current ? 0 : 1 }}
			>
				<Sphere.Artwork />
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
