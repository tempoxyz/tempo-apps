import { useId, useRef, useEffect, useCallback } from 'react'
import { getBezierPath, type EdgeProps } from '@xyflow/react'
import gsap from 'gsap'
import type { FlowEdgeData } from './graph-model'

const PARTICLE_SIZES = [2, 3, 1.5]

export function AnimatedEdge({
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data,
}: EdgeProps): React.JSX.Element {
	const d = data as FlowEdgeData | undefined
	const pathRef = useRef<SVGPathElement>(null)
	const glowRef = useRef<SVGPathElement>(null)
	const subtitleRef = useRef<SVGGElement>(null)
	const particlesRef = useRef<(SVGCircleElement | null)[]>([])
	const tweensRef = useRef<gsap.core.Tween[]>([])
	const hasAnimated = useRef(false)

	const uid = useId()
	const arrowId = `va-arrow-${uid}`
	const glowId = `va-glow-${uid}`

	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	})

	const status = d?.status ?? 'idle'
	const isDashed = d?.dashed ?? false
	const isActive = status === 'active'
	const isDone = status === 'done'
	const isVisible = isActive || isDone

	const killTweens = useCallback(() => {
		for (const t of tweensRef.current) t.kill()
		tweensRef.current = []
	}, [])

	// Draw-in + particle animation when active
	useEffect(() => {
		const path = pathRef.current
		if (!path || !isActive) return

		killTweens()
		hasAnimated.current = true

		const length = path.getTotalLength()
		if (length === 0) return

		path.style.strokeDasharray = `${length}`
		path.style.strokeDashoffset = `${length}`

		// Hide subtitle behind pill
		if (subtitleRef.current) {
			gsap.set(subtitleRef.current, { opacity: 1, y: -20 })
		}

		const drawIn = gsap.to(path, {
			strokeDashoffset: 0,
			duration: 0.7,
			ease: 'power2.inOut',
			onComplete() {
				path.style.strokeDasharray = isDashed ? '6 4' : ''
				path.style.strokeDashoffset = ''
				// Slide subtitle down
				if (subtitleRef.current) {
					const sub = gsap.to(subtitleRef.current, {
						y: 0,
						duration: 0.5,
						ease: 'power3.out',
					})
					tweensRef.current.push(sub)
				}
			},
		})
		tweensRef.current.push(drawIn)

		if (glowRef.current) {
			glowRef.current.style.strokeDasharray = `${length}`
			glowRef.current.style.strokeDashoffset = `${length}`
			const glowDraw = gsap.to(glowRef.current, {
				strokeDashoffset: 0,
				duration: 0.7,
				ease: 'power2.inOut',
				onComplete() {
					if (glowRef.current) {
						glowRef.current.style.strokeDasharray = isDashed ? '6 4' : ''
						glowRef.current.style.strokeDashoffset = ''
					}
				},
			})
			tweensRef.current.push(glowDraw)
		}

		// Staggered particles
		particlesRef.current.forEach((circle, i) => {
			if (!circle) return
			const proxy = { t: 0 }
			const fadeIn = gsap.fromTo(
				circle,
				{ opacity: 0 },
				{ opacity: 0.8, duration: 0.15, delay: 0.35 + i * 0.12 },
			)
			const move = gsap.to(proxy, {
				t: 1,
				duration: 1,
				ease: 'none',
				repeat: -1,
				delay: 0.4 + i * 0.25,
				onUpdate() {
					try {
						const pt = path.getPointAtLength(proxy.t * length)
						circle.setAttribute('cx', String(pt.x))
						circle.setAttribute('cy', String(pt.y))
					} catch {
						/* not ready */
					}
				},
			})
			tweensRef.current.push(fadeIn, move)
		})

		return killTweens
	}, [isActive, isDashed, killTweens])

	// Re-trigger subtitle slide on text change
	const prevSubtitle = useRef(d?.subtitle)
	useEffect(() => {
		if (!subtitleRef.current || !isActive) return
		const changed = prevSubtitle.current !== d?.subtitle
		prevSubtitle.current = d?.subtitle
		if (changed && d?.subtitle) {
			gsap.fromTo(
				subtitleRef.current,
				{ y: -18 },
				{ y: 0, duration: 0.4, ease: 'back.out(1.5)' },
			)
		}
	}, [d?.subtitle, isActive])

	useEffect(() => {
		if (isDone && hasAnimated.current) {
			killTweens()
			particlesRef.current.forEach((c) => {
				if (c) c.setAttribute('opacity', '0')
			})
			if (pathRef.current) {
				pathRef.current.style.strokeDasharray = isDashed ? '6 4' : ''
				pathRef.current.style.strokeDashoffset = ''
			}
			if (glowRef.current) {
				glowRef.current.style.strokeDasharray = isDashed ? '6 4' : ''
				glowRef.current.style.strokeDashoffset = ''
			}
		}
	}, [isDone, isDashed, killTweens])

	useEffect(() => {
		if (status === 'idle') {
			hasAnimated.current = false
			killTweens()
			particlesRef.current.forEach((c) => {
				if (c) c.setAttribute('opacity', '0')
			})
		}
	}, [status, killTweens])

	const groupOpacity = isActive ? 1 : isDone ? 0.5 : 0.12
	const activeColor = '#60a5fa'
	const strokeColor = isActive
		? activeColor
		: isDone
			? '#93c5fd'
			: 'var(--color-border)'

	return (
		<g
			style={{
				opacity: groupOpacity,
				transition: 'opacity 0.4s',
			}}
		>
			<defs>
				<marker
					id={arrowId}
					markerWidth="8"
					markerHeight="6"
					refX="7"
					refY="3"
					orient="auto"
					markerUnits="strokeWidth"
				>
					<polygon points="0,0 8,3 0,6" fill="currentColor" />
				</marker>
				<filter id={glowId}>
					<feGaussianBlur stdDeviation="4" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>

			{/* Glow trail */}
			{isActive && (
				<path
					ref={glowRef}
					d={edgePath}
					fill="none"
					stroke={activeColor}
					strokeWidth={6}
					opacity={0.2}
					filter={`url(#${glowId})`}
				/>
			)}

			<path
				ref={pathRef}
				d={edgePath}
				fill="none"
				stroke={strokeColor}
				strokeWidth={isActive ? 1.8 : 1.2}
				strokeDasharray={isDashed && !isActive ? '6 4' : undefined}
				markerEnd={isVisible ? `url(#${arrowId})` : undefined}
				style={{ transition: 'stroke 0.3s' }}
			/>

			{/* Particles */}
			{PARTICLE_SIZES.map((size, i) => (
				<circle
					key={i}
					ref={(el) => {
						particlesRef.current[i] = el
					}}
					r={size}
					fill={activeColor}
					opacity={0}
				/>
			))}

			{/* Edge label pill — black bg, white text, Tempo icon (PayrollDemoFlow style) */}
			{d?.amount &&
				(() => {
					const iconSpace = 18
					const textLen = d.amount.length * 6.5
					const padX = 12
					const padY = 7
					const pillW = iconSpace + textLen + padX * 2
					const topH = 14 + padY * 2
					const subH = d.subtitle ? 18 : 0
					const pillX = labelX - pillW / 2
					const pillY = labelY - topH / 2
					const clipId = `va-sub-clip-${uid}`
					return (
						<>
							{/* Subtitle slides out from behind pill */}
							{d.subtitle && (
								<>
									<clipPath id={clipId}>
										<rect
											x={pillX - 4}
											y={pillY + topH - 2}
											width={pillW + 8}
											height={subH + 40}
										/>
									</clipPath>
									<g ref={subtitleRef} clipPath={`url(#${clipId})`}>
										<rect
											x={pillX}
											y={pillY + topH}
											width={pillW}
											height={subH}
											fill="var(--color-surface-2)"
											rx={0}
										/>
										<text
											x={labelX}
											y={pillY + topH + subH / 2}
											textAnchor="middle"
											dominantBaseline="central"
											fill="var(--color-text-tertiary)"
											fontSize={9}
											fontFamily="var(--font-mono)"
											fontWeight={500}
											letterSpacing="0.02em"
										>
											{d.subtitle}
										</text>
									</g>
								</>
							)}
							{/* Black pill on top */}
							<rect
								x={pillX}
								y={pillY}
								width={pillW}
								height={topH}
								fill="var(--color-surface-3)"
								rx={0}
							/>
							{/* Tempo "T" icon */}
							<g
								transform={`translate(${pillX + padX - 1}, ${labelY - 5}) scale(${10 / 128})`}
							>
								<path
									d="M52.2137 104H30.5904L50.6315 42.1333H25L30.5904 24H102L96.4096 42.1333H72.1493L52.2137 104Z"
									fill="var(--color-text-tertiary)"
									opacity={0.6}
								/>
							</g>
							<text
								x={pillX + padX + iconSpace}
								y={labelY}
								textAnchor="start"
								dominantBaseline="central"
								fill="var(--color-text-primary)"
								fontSize={11}
								fontWeight={600}
								letterSpacing="0.01em"
							>
								{d.amount}
							</text>
						</>
					)
				})()}
		</g>
	)
}
