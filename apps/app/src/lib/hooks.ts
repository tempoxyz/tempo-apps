import * as React from 'react'

export function useIsMounted() {
	const [isMounted, setIsMounted] = React.useState(false)
	React.useEffect(() => setIsMounted(true), [])
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
