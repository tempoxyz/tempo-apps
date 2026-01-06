import { waapi, stagger } from 'animejs'
import { useEffect, useRef, useState } from 'react'
import { springSmooth } from '#lib/animation'

type IntroPhase = 'initial' | 'search' | 'explore' | 'discover' | 'done'

const INTRO_SEEN_KEY = 'tempo-explorer-intro-seen'

interface IntroProps {
	onPhaseChange?: (phase: IntroPhase) => void
}

function shouldShowAnimation(): boolean {
	const navEntry = performance.getEntriesByType('navigation')[0] as
		| PerformanceNavigationTiming
		| undefined
	return navEntry?.type === 'reload' || !sessionStorage.getItem(INTRO_SEEN_KEY)
}

const words = [
	{ text: 'Search', size: '32px', opacity: 0.5, phase: 'search' },
	{ text: 'Explore', size: '40px', opacity: 0.7, phase: 'explore' },
	{ text: 'Discover', size: '52px', opacity: 1, phase: 'discover' },
] as const

export function Intro({ onPhaseChange }: IntroProps) {
	const [shouldAnimate, setShouldAnimate] = useState<boolean | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (shouldShowAnimation()) {
			setShouldAnimate(true)
			sessionStorage.setItem(INTRO_SEEN_KEY, 'true')
		} else {
			setShouldAnimate(false)
			onPhaseChange?.('done')
		}
	}, [onPhaseChange])

	useEffect(() => {
		if (shouldAnimate !== true || !containerRef.current) return

		onPhaseChange?.('search')
		const children = containerRef.current.querySelectorAll('span')
		waapi
			.animate(children, {
				opacity: [0, 1],
				translate: ['0 12px', '0 0'],
				scale: [0.96, 1],
				ease: springSmooth,
				delay: stagger(60),
			})
			.then(() => onPhaseChange?.('done'))
	}, [shouldAnimate, onPhaseChange])

	if (shouldAnimate === null)
		return (
			<div className="flex flex-col items-center gap-1">
				{words.map((word) => (
					<span
						key={word.text}
						style={{
							opacity: 0,
							fontSize: word.size,
							fontWeight: 600,
							letterSpacing: '-0.02em',
							lineHeight: '0.95',
						}}
					>
						{word.text}
					</span>
				))}
			</div>
		)

	return (
		<div ref={containerRef} className="flex flex-col items-center gap-1">
			{words.map((word) => (
				<span
					key={word.text}
					style={{
						opacity: shouldAnimate ? 0 : word.opacity,
						fontSize: word.size,
						fontWeight: 600,
						letterSpacing: '-0.02em',
						lineHeight: '0.95',
					}}
				>
					{word.text}
				</span>
			))}
		</div>
	)
}

export type { IntroPhase }
