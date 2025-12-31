import { useEffect, useState } from 'react'

type IntroPhase = 'initial' | 'search' | 'explore' | 'discover' | 'done'

const INTRO_SEEN_KEY = 'tempo-explorer-intro-seen'

interface IntroProps {
	onPhaseChange?: (phase: IntroPhase) => void
}

function shouldShowAnimation(): boolean {
	// Check if this is a hard refresh (reload)
	const navEntries = performance.getEntriesByType('navigation')
	const navEntry = navEntries[0] as PerformanceNavigationTiming | undefined
	const isReload = navEntry?.type === 'reload'

	// Show animation on hard refresh
	if (isReload) {
		return true
	}

	// Check if we've seen the intro in this session
	const hasSeenIntro = sessionStorage.getItem(INTRO_SEEN_KEY)
	return !hasSeenIntro
}

export function Intro({ onPhaseChange }: IntroProps) {
	const [visibleWords, setVisibleWords] = useState<number>(0)
	const [shouldAnimate, setShouldAnimate] = useState<boolean | null>(null)

	// biome-ignore lint/correctness/useExhaustiveDependencies: This is intentional
	useEffect(() => {
		const animate = shouldShowAnimation()

		if (animate) {
			// First visit or hard refresh - animate
			setShouldAnimate(true)
			// Mark as seen for this session
			sessionStorage.setItem(INTRO_SEEN_KEY, 'true')
		} else {
			// Skip animation - show everything immediately
			setShouldAnimate(false)
			setVisibleWords(3)
			onPhaseChange?.('done')
		}
	}, []) // Only run once on mount

	useEffect(() => {
		if (shouldAnimate !== true) return

		// Smoother, more gradual timings
		const timings = [
			{ delay: 200, word: 1, phase: 'search' as const },
			{ delay: 900, word: 2, phase: 'explore' as const },
			{ delay: 1600, word: 3, phase: 'discover' as const },
			{ delay: 2600, word: 3, phase: 'done' as const },
		]

		const timeouts = timings.map(({ delay, word, phase: p }) =>
			setTimeout(() => {
				setVisibleWords(word)
				onPhaseChange?.(p)
			}, delay),
		)

		return () => timeouts.forEach(clearTimeout)
	}, [shouldAnimate, onPhaseChange])

	const words = [
		{ text: 'Search', size: '32px', opacity: 0.5 },
		{ text: 'Explore', size: '40px', opacity: 0.7 },
		{ text: 'Discover', size: '52px', opacity: 1 },
	]

	// Don't render until we know whether to animate
	if (shouldAnimate === null) {
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
	}

	return (
		<div className="flex flex-col items-center gap-1">
			{words.map((word, index) => (
				<span
					key={word.text}
					className="transition-all duration-500 ease-out"
					style={{
						opacity: visibleWords > index ? word.opacity : 0,
						transform:
							visibleWords > index ? 'translateY(0)' : 'translateY(12px)',
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
