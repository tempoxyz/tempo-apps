import * as React from 'react'

export function useIsMounted() {
	const [isMounted, setIsMounted] = React.useState(false)

	React.useEffect(() => {
		setIsMounted(true)
	}, [])

	return isMounted
}

export function useCopy(props: useCopy.Props = { timeout: 800 }) {
	const { timeout } = props

	const [notifying, setNotifying] = React.useState(false)
	const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

	const copy: useCopy.Result['copy'] = React.useCallback(
		async (value: string) => {
			if (timer.current) clearTimeout(timer.current)
			try {
				if (!navigator.clipboard) throw new Error('Clipboard API not supported')
				await navigator.clipboard.writeText(value)
				setNotifying(true)
				timer.current = setTimeout(() => setNotifying(false), timeout)
			} catch (error) {
				console.error('Failed to copy text: ', error)
			}
		},
		[timeout],
	)

	return { copy, notifying }
}

export declare namespace useCopy {
	type Props = {
		timeout?: number | undefined
	}

	type Result = {
		copy: (value: string) => Promise<void>
		notifying: boolean
	}
}

export function useMediaQuery(query: string) {
	// Use null to indicate "unknown" state during SSR
	const [matches, setMatches] = React.useState<boolean | null>(null)

	React.useEffect(() => {
		const mediaQuery = window.matchMedia(query)
		setMatches(mediaQuery.matches)

		const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
		mediaQuery.addEventListener('change', handler)
		return () => mediaQuery.removeEventListener('change', handler)
	}, [query])

	// Return false during SSR/initial render to ensure consistent hydration
	return matches ?? false
}

export function useCopyPermalink(props: useCopyPermalink.Props) {
	const { fragment } = props

	const { copy: copyLink, notifying: linkNotifying } = useCopy({
		timeout: 2_000,
	})

	const handleCopyPermalink = React.useCallback(() => {
		const url = new URL(window.location.href)
		url.hash = fragment
		void copyLink(url.toString())
	}, [fragment, copyLink])

	return { copyLink, linkNotifying, handleCopyPermalink }
}

export declare namespace useCopyPermalink {
	type Props = {
		fragment: string
	}

	type Result = {
		linkNotifying: boolean
		handleCopyPermalink: () => Promise<void>
		copyLink?: (value: string) => Promise<void>
	}
}

export function useDownload(props: useDownload.Props) {
	const { value, filename, contentType } = props

	const download = React.useCallback(() => {
		if (!value || typeof window === 'undefined') return

		const blob = new Blob([value], { type: contentType })
		const url = URL.createObjectURL(blob)

		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = filename

		document.body.appendChild(anchor)
		anchor.click()
		document.body.removeChild(anchor)
		URL.revokeObjectURL(url)
	}, [value, filename, contentType])

	return { download }
}

export declare namespace useDownload {
	type Props = {
		value: string
		filename: string
		contentType:
			| 'text/csv'
			| 'text/plain'
			| 'application/json'
			| 'application/pdf'
	}
}

export function useKeyboardShortcut(shortcuts: Record<string, () => void>) {
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement
			if (
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.isContentEditable
			) {
				return
			}
			const key = event.key.toLowerCase()
			if (
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				key in shortcuts
			) {
				event.preventDefault()
				shortcuts[key]()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [shortcuts])
}

export function usePermalinkHighlight(props: usePermalinkHighlight.Props) {
	const { elementId, highlightDuration = 2_000, onTargetChange } = props

	const [hash, setHash] = React.useState<string | null>(null)

	React.useEffect(() => {
		setHash(window.location.hash)

		const handleHashChange = () => setHash(window.location.hash)
		window.addEventListener('hashchange', handleHashChange)
		return () => window.removeEventListener('hashchange', handleHashChange)
	}, [])

	React.useEffect(() => {
		if (hash === null) return

		const isTarget = hash === `#${elementId}`
		if (!isTarget) return

		onTargetChange?.(true)

		const highlightClasses = [
			'ring-1',
			'ring-accent',
			'ring-offset-1',
			'transition-shadow',
			'duration-500',
		] as const

		let highlightTimer: ReturnType<typeof setTimeout> | undefined
		let fadeTimer: ReturnType<typeof setTimeout> | undefined
		let initialTimer: ReturnType<typeof setTimeout> | undefined
		let observerCleanup: (() => void) | undefined
		let highlightedElement: HTMLElement | undefined

		const removeHighlightClasses = () => {
			if (!highlightedElement) return
			highlightedElement.classList.remove(
				...highlightClasses,
				'ring-transparent',
			)
		}

		const scrollAndHighlight = (element: HTMLElement) => {
			highlightedElement = element
			element.scrollIntoView({ behavior: 'smooth', block: 'center' })
			element.classList.add(...highlightClasses)
			highlightTimer = setTimeout(() => {
				element.classList.remove('ring-accent')
				element.classList.add('ring-transparent')
				fadeTimer = setTimeout(() => {
					element.classList.remove(...highlightClasses, 'ring-transparent')
				}, 500)
			}, highlightDuration)
		}

		const element = document.getElementById(elementId)
		if (element) {
			initialTimer = setTimeout(() => scrollAndHighlight(element), 100)
		} else {
			const observer = new MutationObserver(() => {
				const el = document.getElementById(elementId)
				if (el) {
					observer.disconnect()
					scrollAndHighlight(el)
				}
			})

			observer.observe(document.body, { childList: true, subtree: true })
			observerCleanup = () => observer.disconnect()
		}

		return () => {
			clearTimeout(initialTimer)
			clearTimeout(highlightTimer)
			clearTimeout(fadeTimer)
			removeHighlightClasses()
			observerCleanup?.()
		}
	}, [elementId, highlightDuration, onTargetChange, hash])
}

export declare namespace usePermalinkHighlight {
	type Props = {
		elementId: string
		highlightDuration?: number
		onTargetChange?: (isTarget: boolean) => void
	}
}
