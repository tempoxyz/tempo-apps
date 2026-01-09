import { spring } from 'animejs'

// near instant, e.g. for user interactions
export const springInstant = spring({
	mass: 1,
	stiffness: 1200,
	damping: 38,
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
