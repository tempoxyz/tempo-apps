import { useCallback, useRef, useState } from 'react'

export function useCopy(timeout = 800) {
	const [notifying, setNotifying] = useState(false)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const copy = useCallback(
		async (value: string) => {
			if (timer.current) clearTimeout(timer.current)
			try {
				if (!navigator.clipboard)
					throw new Error('Clipboard API not supported')
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
