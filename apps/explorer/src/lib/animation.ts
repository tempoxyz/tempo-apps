import { waapi, spring } from 'animejs'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// near instant, e.g. for user interactions
export const springInstant = spring({
	mass: 1,
	stiffness: 1400,
	damping: 40,
})

// use to put emphasis on an element,
// slightly faster & bouncier than smooth
export const springBouncy = spring({
	mass: 1,
	stiffness: 600,
	damping: 28,
})

// default for most animations
export const springSmooth = spring({
	mass: 1,
	stiffness: 280,
	damping: 20,
})

// slow & gentle, e.g. for background elements
export const springLazy = spring({
	mass: 1,
	stiffness: 220,
	damping: 50,
})

const defaultEnter = {
	opacity: [0, 1],
	scale: [0.99, 1],
	translateY: [-4, 0],
	ease: springInstant,
}

const defaultExit = {
	opacity: [1, 0],
	scale: [1, 0.99],
	ease: springInstant,
}

export function useMountAnim(
	open: boolean,
	ref: React.RefObject<HTMLElement | null>,
	options: {
		enter?: Parameters<typeof waapi.animate>[1]
		exit?: Parameters<typeof waapi.animate>[1]
	} = {},
) {
	const [mounted, setMounted] = useState(false)
	const { enter = defaultEnter, exit = defaultExit } = options
	const prevOpenRef = useRef(open)
	const prevMountedRef = useRef(mounted)
	const closingRef = useRef(false)

	useEffect(() => {
		const wasOpen = prevOpenRef.current
		prevOpenRef.current = open

		// opening
		if (open && !wasOpen) {
			if (closingRef.current && ref.current) {
				// interrupt close animation
				closingRef.current = false
				waapi.animate(ref.current, enter)
			} else {
				setMounted(true)
			}
		}
		// closing
		else if (!open && wasOpen && mounted && ref.current) {
			closingRef.current = true
			waapi.animate(ref.current, exit).then(() => {
				if (closingRef.current) {
					setMounted(false)
					closingRef.current = false
				}
			})
		}
	}, [open, mounted, ref, enter, exit])

	useLayoutEffect(() => {
		const wasMounted = prevMountedRef.current
		prevMountedRef.current = mounted

		if (open && mounted && !wasMounted && ref.current) {
			waapi.animate(ref.current, enter)
		}
	}, [mounted, open, ref, enter])

	return mounted
}
