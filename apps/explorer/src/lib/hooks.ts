import * as React from 'react'

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
