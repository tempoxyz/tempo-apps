import { waapi, stagger } from 'animejs'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { springInstant, springSmooth } from '#lib/animation'

type IntroPhase = 'start' | 'end'

interface IntroProps {
	onPhaseChange?: (phase: IntroPhase) => void
}

const IntroSeenContext = createContext(false)
const IntroSeenSetContext = createContext<(() => void) | null>(null)

export function IntroSeenProvider({ children }: { children: React.ReactNode }) {
	const [seen, setSeen] = useState(false)
	return (
		<IntroSeenContext.Provider value={seen}>
			<IntroSeenSetContext.Provider value={() => setSeen(true)}>
				{children}
			</IntroSeenSetContext.Provider>
		</IntroSeenContext.Provider>
	)
}

const words = [
	{ text: 'Search', size: '32px', opacity: 0.5 },
	{ text: 'Explore', size: '40px', opacity: 0.7 },
	{ text: 'Discover', size: '52px', opacity: 1 },
] as const

export function Intro({ onPhaseChange }: IntroProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const animatedRef = useRef(false)
	const seen = useContext(IntroSeenContext)
	const setSeen = useContext(IntroSeenSetContext)

	useEffect(() => {
		if (animatedRef.current || !containerRef.current) return
		animatedRef.current = true

		if (seen) {
			onPhaseChange?.('start')
			for (const child of containerRef.current.querySelectorAll(
				'[data-word]',
			)) {
				;(child as HTMLElement).style.opacity = '1'
			}
			waapi
				.animate(containerRef.current, {
					opacity: [0, 1],
					scale: [0.97, 1],
					ease: springInstant,
				})
				.then(() => onPhaseChange?.('end'))
			return
		}

		setSeen?.()
		onPhaseChange?.('start')
		const children = containerRef.current.querySelectorAll('[data-word]')
		waapi
			.animate(children, {
				opacity: [0, 1],
				translate: ['0 12px', '0 0'],
				scale: [0.96, 1],
				ease: springSmooth,
				delay: stagger(60),
			})
			.then(() => onPhaseChange?.('end'))
	}, [onPhaseChange, seen, setSeen])

	return (
		<div ref={containerRef} className="flex flex-col items-center gap-1">
			{words.map((word) => (
				<span
					key={word.text}
					data-word
					style={{
						opacity: 0,
						fontSize: word.size,
						fontWeight: 600,
						letterSpacing: '-0.02em',
						lineHeight: '0.95',
					}}
				>
					<span style={{ opacity: word.opacity }}>{word.text}</span>
				</span>
			))}
		</div>
	)
}

export function useIntroSeen() {
	return useContext(IntroSeenContext)
}

export type { IntroPhase }
