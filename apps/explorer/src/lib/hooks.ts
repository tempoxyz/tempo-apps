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
