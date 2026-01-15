import * as React from 'react'

/**
 * Accessibility primitives for the Tempo app
 */

// ============================================
// Screen Reader Announcer
// ============================================

type AnnouncerContextType = {
	announce: (message: string, priority?: 'polite' | 'assertive') => void
}

const AnnouncerContext = React.createContext<AnnouncerContextType | null>(null)

export function AnnouncerProvider({ children }: { children: React.ReactNode }) {
	const [politeMessage, setPoliteMessage] = React.useState('')
	const [assertiveMessage, setAssertiveMessage] = React.useState('')

	const announce = React.useCallback(
		(message: string, priority: 'polite' | 'assertive' = 'polite') => {
			if (priority === 'assertive') {
				setAssertiveMessage('')
				requestAnimationFrame(() => setAssertiveMessage(message))
			} else {
				setPoliteMessage('')
				requestAnimationFrame(() => setPoliteMessage(message))
			}
		},
		[],
	)

	return (
		<AnnouncerContext.Provider value={{ announce }}>
			{children}
			<div
				aria-live="polite"
				aria-atomic="true"
				className="announcer"
				role="status"
			>
				{politeMessage}
			</div>
			<div
				aria-live="assertive"
				aria-atomic="true"
				className="announcer"
				role="alert"
			>
				{assertiveMessage}
			</div>
		</AnnouncerContext.Provider>
	)
}

export function useAnnounce() {
	const context = React.useContext(AnnouncerContext)
	if (!context) {
		return {
			announce: (_message: string, _priority?: 'polite' | 'assertive') => {},
		}
	}
	return context
}

// ============================================
// Focus Management
// ============================================

/**
 * Trap focus within a container (for modals, dialogs)
 */
export function useFocusTrap(isActive: boolean) {
	const containerRef = React.useRef<HTMLDivElement>(null)
	const previousActiveElement = React.useRef<HTMLElement | null>(null)

	React.useEffect(() => {
		if (!isActive || !containerRef.current) return

		previousActiveElement.current = document.activeElement as HTMLElement

		const focusableElements =
			containerRef.current.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
			)
		const firstElement = focusableElements[0]
		const lastElement = focusableElements[focusableElements.length - 1]

		// Focus first element
		firstElement?.focus()

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Tab') return

			if (e.shiftKey) {
				if (document.activeElement === firstElement) {
					e.preventDefault()
					lastElement?.focus()
				}
			} else {
				if (document.activeElement === lastElement) {
					e.preventDefault()
					firstElement?.focus()
				}
			}
		}

		document.addEventListener('keydown', handleKeyDown)

		return () => {
			document.removeEventListener('keydown', handleKeyDown)
			previousActiveElement.current?.focus()
		}
	}, [isActive])

	return containerRef
}

/**
 * Return focus to trigger element when component unmounts
 */
export function useReturnFocus() {
	const triggerRef = React.useRef<HTMLElement | null>(null)

	const saveTrigger = React.useCallback(() => {
		triggerRef.current = document.activeElement as HTMLElement
	}, [])

	const returnFocus = React.useCallback(() => {
		triggerRef.current?.focus()
	}, [])

	return { saveTrigger, returnFocus, triggerRef }
}

// ============================================
// Keyboard Navigation
// ============================================

/**
 * Handle escape key to close modals/dropdowns
 */
export function useEscapeKey(callback: () => void, isActive = true) {
	React.useEffect(() => {
		if (!isActive) return

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				callback()
			}
		}

		document.addEventListener('keydown', handleEscape)
		return () => document.removeEventListener('keydown', handleEscape)
	}, [callback, isActive])
}

/**
 * Arrow key navigation for lists
 */
export function useArrowNavigation<T extends HTMLElement>(
	items: React.RefObject<T>[],
	options: {
		orientation?: 'horizontal' | 'vertical' | 'both'
		loop?: boolean
	} = {},
) {
	const { orientation = 'vertical', loop = true } = options
	const [focusedIndex, setFocusedIndex] = React.useState(-1)

	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent) => {
			const isVertical = orientation === 'vertical' || orientation === 'both'
			const isHorizontal =
				orientation === 'horizontal' || orientation === 'both'

			let nextIndex = focusedIndex

			if (
				(e.key === 'ArrowDown' && isVertical) ||
				(e.key === 'ArrowRight' && isHorizontal)
			) {
				e.preventDefault()
				nextIndex = focusedIndex + 1
				if (nextIndex >= items.length) {
					nextIndex = loop ? 0 : items.length - 1
				}
			} else if (
				(e.key === 'ArrowUp' && isVertical) ||
				(e.key === 'ArrowLeft' && isHorizontal)
			) {
				e.preventDefault()
				nextIndex = focusedIndex - 1
				if (nextIndex < 0) {
					nextIndex = loop ? items.length - 1 : 0
				}
			} else if (e.key === 'Home') {
				e.preventDefault()
				nextIndex = 0
			} else if (e.key === 'End') {
				e.preventDefault()
				nextIndex = items.length - 1
			}

			if (nextIndex !== focusedIndex) {
				setFocusedIndex(nextIndex)
				items[nextIndex]?.current?.focus()
			}
		},
		[focusedIndex, items, orientation, loop],
	)

	return { focusedIndex, setFocusedIndex, handleKeyDown }
}

// ============================================
// Reduced Motion
// ============================================

/**
 * Check if user prefers reduced motion
 */
export function usePrefersReducedMotion(): boolean {
	const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false)

	React.useEffect(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
		setPrefersReducedMotion(mediaQuery.matches)

		const handler = (e: MediaQueryListEvent) => {
			setPrefersReducedMotion(e.matches)
		}

		mediaQuery.addEventListener('change', handler)
		return () => mediaQuery.removeEventListener('change', handler)
	}, [])

	return prefersReducedMotion
}

// ============================================
// Unique IDs
// ============================================

let idCounter = 0

/**
 * Generate stable unique IDs for ARIA attributes
 */
export function useStableId(prefix = 'tempo'): string {
	const idRef = React.useRef<string | null>(null)

	if (idRef.current === null) {
		idCounter++
		idRef.current = `${prefix}-${idCounter}`
	}

	return idRef.current
}

// ============================================
// Click Outside
// ============================================

/**
 * Detect clicks outside of a ref element
 */
export function useClickOutside<T extends HTMLElement>(
	callback: () => void,
	isActive = true,
) {
	const ref = React.useRef<T>(null)

	React.useEffect(() => {
		if (!isActive) return

		const handleClick = (e: MouseEvent | TouchEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				callback()
			}
		}

		document.addEventListener('mousedown', handleClick)
		document.addEventListener('touchstart', handleClick)

		return () => {
			document.removeEventListener('mousedown', handleClick)
			document.removeEventListener('touchstart', handleClick)
		}
	}, [callback, isActive])

	return ref
}

// ============================================
// Roving Tab Index
// ============================================

/**
 * Implement roving tabindex pattern for composite widgets
 */
export function useRovingTabIndex<T extends HTMLElement>(itemCount: number) {
	const [activeIndex, setActiveIndex] = React.useState(0)
	const itemRefs = React.useRef<(T | null)[]>([])

	const getTabIndex = (index: number) => (index === activeIndex ? 0 : -1)

	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent, index: number) => {
			let nextIndex = index

			switch (e.key) {
				case 'ArrowDown':
				case 'ArrowRight':
					e.preventDefault()
					nextIndex = (index + 1) % itemCount
					break
				case 'ArrowUp':
				case 'ArrowLeft':
					e.preventDefault()
					nextIndex = (index - 1 + itemCount) % itemCount
					break
				case 'Home':
					e.preventDefault()
					nextIndex = 0
					break
				case 'End':
					e.preventDefault()
					nextIndex = itemCount - 1
					break
				default:
					return
			}

			setActiveIndex(nextIndex)
			itemRefs.current[nextIndex]?.focus()
		},
		[itemCount],
	)

	const setItemRef = React.useCallback((index: number) => {
		return (el: T | null) => {
			itemRefs.current[index] = el
		}
	}, [])

	return { activeIndex, setActiveIndex, getTabIndex, handleKeyDown, setItemRef }
}

// ============================================
// Skip Link Component
// ============================================

export function SkipLink({
	href = '#main-content',
	children = 'Skip to main content',
}: {
	href?: string
	children?: React.ReactNode
}) {
	return (
		<a href={href} className="skip-link focus-ring">
			{children}
		</a>
	)
}

// ============================================
// Visually Hidden Component
// ============================================

export function VisuallyHidden({
	children,
	as = 'span',
}: {
	children: React.ReactNode
	as?: 'span' | 'div' | 'p' | 'label' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
}) {
	const Component = as
	return <Component className="sr-only">{children}</Component>
}

// ============================================
// Live Region Component
// ============================================

export function LiveRegion({
	children,
	priority = 'polite',
	atomic = true,
}: {
	children: React.ReactNode
	priority?: 'polite' | 'assertive'
	atomic?: boolean
}) {
	return (
		<div
			aria-live={priority}
			aria-atomic={atomic}
			role={priority === 'assertive' ? 'alert' : 'status'}
			className="sr-only"
		>
			{children}
		</div>
	)
}
